import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getUserRegularCafeCount, getUserRegularCafes } from '@/lib/profiles/regulars'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// regular_customers の RLS（全公開）と lib/profiles/regulars.ts を実DBに対して動かす。確認したいのは:
//  1. regular_customers_select_active が全公開なので anon から user_id を渡しても正しく読めること
//     （security definer 関数は不要 — 引き継ぎメモの落とし穴1）
//  2. 埋め込んだ cafes が RLS で消え、`!inner` が無いと「行はあるのに cafes が null」になること
//  3. revoked_at が付いた行は誰からも「有効な行きつけ」として見えないこと
//  4. 一覧（getUserRegularCafes）と件数（getUserRegularCafeCount）が同じ条件で数えること

const service = serviceRoleClient()
const anon = anonClient()

let target: AuthedUser
let other: AuthedUser
let owner: AuthedUser

const cafeIds: string[] = []

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

async function insertCafe(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: '行きつけのテスト店', prefecture: '東京都', city: '渋谷区', ...overrides })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id
}

/** awarded_at を明示して並び順を決定的にする */
async function award(userId: string, cafeId: string, overrides: Record<string, unknown> = {}) {
  const { error } = await service.from('regular_customers').insert({
    user_id: userId,
    cafe_id: cafeId,
    awarded_by: owner.userId,
    ...overrides,
  })
  if (error) throw new Error(`テスト用 regular_customers の作成に失敗: ${error.message}`)
}

let activeCafeId: string
let secondCafeId: string
let closedCafeId: string
let hiddenCafeId: string
let noAreaCafeId: string
let revokedCafeId: string

beforeAll(async () => {
  target = await createAuthedProfile({ username: 'regular_target' })
  other = await createAuthedProfile({ username: 'regular_other' })
  owner = await createAuthedProfile({ username: 'regular_awarder', role: 'owner' })

  const { data: area } = await service.from('areas').select('code, label').limit(1).single()
  if (!area) throw new Error('areas の seed が無い')

  activeCafeId = await insertCafe({ name: '表参道の行きつけ', area_code: area.code })
  secondCafeId = await insertCafe({ name: '2番目の行きつけ', area_code: area.code })
  closedCafeId = await insertCafe({ name: '閉店した行きつけ', status: 'closed' })
  hiddenCafeId = await insertCafe({ name: '非公開の行きつけ', status: 'hidden' })
  noAreaCafeId = await insertCafe({ name: 'エリア未設定の行きつけ', area_code: null })
  revokedCafeId = await insertCafe({ name: '取消済みの行きつけ' })

  await award(target.userId, activeCafeId, { awarded_at: '2026-01-02T00:00:00Z' })
  await award(target.userId, secondCafeId, { awarded_at: '2026-01-03T00:00:00Z' })
  await award(target.userId, noAreaCafeId, { awarded_at: '2026-01-01T00:00:00Z' })
  // 閉店・非公開になった店も regular_customers 行としては残り続ける
  await award(target.userId, closedCafeId, { awarded_at: '2026-01-04T00:00:00Z' })
  await award(target.userId, hiddenCafeId, { awarded_at: '2026-01-05T00:00:00Z' })
  await award(target.userId, revokedCafeId, {
    awarded_at: '2026-01-06T00:00:00Z',
    revoked_at: '2026-01-10T00:00:00Z',
  })

  await award(other.userId, activeCafeId)
})

afterAll(async () => {
  if (cafeIds.length > 0) await service.from('cafes').delete().in('id', cafeIds)
  await target?.cleanup()
  await other?.cleanup()
  await owner?.cleanup()
})

describe('埋め込んだカフェの RLS（落とし穴: 行はあるのに cafes が null）', () => {
  it('!inner を付けないと closed / hidden の行きつけ行が cafes = null で返る', async () => {
    const { data, error } = await anon
      .from('regular_customers')
      .select('cafe_id, cafes (id, name)')
      .eq('user_id', target.userId)
      .is('revoked_at', null)

    expect(error).toBeNull()
    // revoked_at is null の5件は anon からも全件読める（regular_customers_select_active は全公開）
    expect(data?.length).toBe(5)

    const nulled = (data ?? []).filter((row) => row.cafes === null).map((row) => row.cafe_id)
    expect(nulled.sort()).toEqual([closedCafeId, hiddenCafeId].sort())
  })
})

describe('getUserRegularCafes', () => {
  it('!inner で行ごと落とすので空カードが並ばない', async () => {
    const entries = await getUserRegularCafes(typed(anon), target.userId)

    expect(entries.map((entry) => entry.cafeId)).not.toContain(closedCafeId)
    expect(entries.map((entry) => entry.cafeId)).not.toContain(hiddenCafeId)
    expect(entries.every((entry) => entry.name.length > 0)).toBe(true)
  })

  it('取消済み（revoked_at 有り）は出さない', async () => {
    const entries = await getUserRegularCafes(typed(anon), target.userId)
    expect(entries.map((entry) => entry.cafeId)).not.toContain(revokedCafeId)
  })

  it('認定日の新しい順に返す', async () => {
    const entries = await getUserRegularCafes(typed(anon), target.userId)
    expect(entries.map((entry) => entry.cafeId)).toEqual([secondCafeId, activeCafeId, noAreaCafeId])
  })

  it('area_code 未設定のカフェは市区町村で代替する', async () => {
    const entries = await getUserRegularCafes(typed(anon), target.userId)
    expect(entries.find((entry) => entry.cafeId === noAreaCafeId)?.areaLabel).toBe('東京都渋谷区')
  })

  it('anon から user_id を渡すだけで読める（全公開のRLS、security definerは不要）', async () => {
    const asAnon = await getUserRegularCafes(typed(anon), target.userId)
    const asOther = await getUserRegularCafes(typed(other.client), target.userId)
    expect(asAnon.map((e) => e.cafeId).sort()).toEqual(asOther.map((e) => e.cafeId).sort())
  })

  it('他人の行きつけは混ざらない', async () => {
    const entries = await getUserRegularCafes(typed(anon), other.userId)
    expect(entries.map((entry) => entry.cafeId)).toEqual([activeCafeId])
  })

  it('limit を超えた分は返さない', async () => {
    expect((await getUserRegularCafes(typed(anon), target.userId, 2)).length).toBe(2)
  })
})

describe('getUserRegularCafeCount', () => {
  it('一覧と同じ条件で数える（閉店・非公開・取消済みを件数に残さない）', async () => {
    const count = await getUserRegularCafeCount(typed(anon), target.userId)
    const entries = await getUserRegularCafes(typed(anon), target.userId)

    expect(count).toBe(entries.length)
    expect(count).toBe(3)
  })

  it('行きつけが無いユーザーは0', async () => {
    const noRegulars = await createAuthedProfile({ username: 'regular_none' })
    try {
      expect(await getUserRegularCafeCount(typed(anon), noRegulars.userId)).toBe(0)
    } finally {
      await noRegulars.cleanup()
    }
  })
})
