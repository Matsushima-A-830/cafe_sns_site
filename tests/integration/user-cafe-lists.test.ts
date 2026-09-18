import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getCafeListMembership,
  getUserCafeList,
  getUserCafeListCounts,
} from '@/lib/cafes/user-cafe-lists'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// user_cafe_lists の RLS と lib/cafes/user-cafe-lists.ts を実 DB に対して動かす。確認したいのは:
//  1. 埋め込んだ cafes が RLS で消え、`!inner` が無いと「行はあるのに cafes が null」になること
//  2. 他人のリストは読めず、書き込みも自分の user_id でしか通らないこと
//  3. お気に入りと「行きたい」が排他でないこと（同じカフェが両方に入る）
//  4. suspended / pending_consent は追加できず、解除だけはできること

const service = serviceRoleClient()
const anon = anonClient()

let owner: AuthedUser
let other: AuthedUser
let suspended: AuthedUser

const cafeIds: string[] = []

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

async function insertCafe(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: 'リストのテスト店', prefecture: '東京都', city: '渋谷区', ...overrides })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id
}

/** created_at を明示して並び順を決定的にする（DEFAULT now() だと同一トランザクションで同値になる） */
async function addToList(
  userId: string,
  cafeId: string,
  listType: 'favorite' | 'want_to_go',
  overrides: Record<string, unknown> = {},
) {
  const { error } = await service
    .from('user_cafe_lists')
    .insert({ user_id: userId, cafe_id: cafeId, list_type: listType, ...overrides })
  if (error) throw new Error(`テスト用 user_cafe_lists の作成に失敗: ${error.message}`)
}

let activeCafeId: string
let secondCafeId: string
let closedCafeId: string
let hiddenCafeId: string
let noAreaCafeId: string

beforeAll(async () => {
  owner = await createAuthedProfile({ username: 'owner_cafe_lists' })
  other = await createAuthedProfile({ username: 'other_cafe_lists' })
  suspended = await createAuthedProfile({ username: 'suspended_cafe_lists', status: 'suspended' })

  // areas マスタは seed 済み。ラベルの解決を確かめるため実在するコードを使う
  const { data: area } = await service.from('areas').select('code, label').limit(1).single()
  if (!area) throw new Error('areas の seed が無い')

  activeCafeId = await insertCafe({ name: '表参道ロースタリー', area_code: area.code })
  secondCafeId = await insertCafe({ name: '二番目の店', area_code: area.code })
  closedCafeId = await insertCafe({ name: '閉店した店', status: 'closed' })
  hiddenCafeId = await insertCafe({ name: '非公開の店', status: 'hidden' })
  noAreaCafeId = await insertCafe({ name: 'エリア未設定の店', area_code: null })

  await addToList(owner.userId, activeCafeId, 'favorite', {
    created_at: '2026-01-02T00:00:00Z',
    note: '豆が好み',
  })
  await addToList(owner.userId, secondCafeId, 'favorite', { created_at: '2026-01-03T00:00:00Z' })
  await addToList(owner.userId, noAreaCafeId, 'favorite', { created_at: '2026-01-01T00:00:00Z' })
  // 閉店・非公開になった店もリスト行としては残り続ける（掃除するジョブは無い）
  await addToList(owner.userId, closedCafeId, 'favorite', { created_at: '2026-01-04T00:00:00Z' })
  await addToList(owner.userId, hiddenCafeId, 'favorite', { created_at: '2026-01-05T00:00:00Z' })
  // 同じカフェが両方のリストに入る（排他ではない）
  await addToList(owner.userId, activeCafeId, 'want_to_go', { created_at: '2026-01-06T00:00:00Z' })

  await addToList(other.userId, activeCafeId, 'favorite')
})

afterAll(async () => {
  if (cafeIds.length > 0) await service.from('cafes').delete().in('id', cafeIds)
  await owner?.cleanup()
  await other?.cleanup()
  await suspended?.cleanup()
})

describe('埋め込んだカフェの RLS（落とし穴: 行はあるのに cafes が null）', () => {
  it('!inner を付けないと closed / hidden のリスト行が cafes = null で返る', async () => {
    const { data, error } = await owner.client
      .from('user_cafe_lists')
      .select('cafe_id, cafes (id, name)')
      .eq('list_type', 'favorite')

    expect(error).toBeNull()
    // 自分のリスト行は5件すべて読める（user_cafe_lists_select_own は status を見ない）
    expect(data?.length).toBe(5)

    const nulled = (data ?? []).filter((row) => row.cafes === null).map((row) => row.cafe_id)
    expect(nulled.sort()).toEqual([closedCafeId, hiddenCafeId].sort())
  })

  it('getUserCafeList は !inner で行ごと落とすので空カードが並ばない', async () => {
    const entries = await getUserCafeList(typed(owner.client), 'favorite')

    expect(entries.map((entry) => entry.cafeId)).not.toContain(closedCafeId)
    expect(entries.map((entry) => entry.cafeId)).not.toContain(hiddenCafeId)
    expect(entries.every((entry) => entry.name.length > 0)).toBe(true)
  })
})

describe('getUserCafeList', () => {
  it('追加日の新しい順に返す（閉店・非公開は除く）', async () => {
    const entries = await getUserCafeList(typed(owner.client), 'favorite')

    expect(entries.map((entry) => entry.cafeId)).toEqual([secondCafeId, activeCafeId, noAreaCafeId])
  })

  it('メモと追加日をそのまま持つ', async () => {
    const entries = await getUserCafeList(typed(owner.client), 'favorite')

    expect(entries.find((entry) => entry.cafeId === activeCafeId)).toMatchObject({
      name: '表参道ロースタリー',
      note: '豆が好み',
    })
    expect(entries.find((entry) => entry.cafeId === secondCafeId)?.note).toBeNull()
  })

  it('area_code 未設定のカフェは市区町村で代替する', async () => {
    const entries = await getUserCafeList(typed(owner.client), 'favorite')

    expect(entries.find((entry) => entry.cafeId === noAreaCafeId)?.areaLabel).toBe('東京都渋谷区')
  })

  it('list_type ごとに分かれる。同じカフェが両方のリストに入る', async () => {
    const wantToGo = await getUserCafeList(typed(owner.client), 'want_to_go')

    expect(wantToGo.map((entry) => entry.cafeId)).toEqual([activeCafeId])
  })

  it('他人のリストは読めない（0件になる）', async () => {
    expect(await getUserCafeList(typed(other.client), 'want_to_go')).toEqual([])
  })

  it('未ログインでは0件（anon にポリシーが無い）', async () => {
    expect(await getUserCafeList(typed(anon), 'favorite')).toEqual([])
  })

  it('limit を超えた分は返さない', async () => {
    expect((await getUserCafeList(typed(owner.client), 'favorite', 2)).length).toBe(2)
  })
})

describe('getUserCafeListCounts', () => {
  it('一覧と同じ条件で数える（閉店・非公開を件数に残さない）', async () => {
    const counts = await getUserCafeListCounts(typed(owner.client))
    const favorites = await getUserCafeList(typed(owner.client), 'favorite')

    expect(counts.favorite).toBe(favorites.length)
    expect(counts).toEqual({ favorite: 3, want_to_go: 1 })
  })

  it('未ログインでは両方0', async () => {
    expect(await getUserCafeListCounts(typed(anon))).toEqual({ favorite: 0, want_to_go: 0 })
  })
})

describe('getCafeListMembership', () => {
  it('両方のリストの在否を返す', async () => {
    expect(await getCafeListMembership(typed(owner.client), activeCafeId)).toEqual({
      favorite: true,
      want_to_go: true,
    })
    expect(await getCafeListMembership(typed(owner.client), secondCafeId)).toEqual({
      favorite: true,
      want_to_go: false,
    })
  })

  it('他人の登録は自分の状態に混ざらない', async () => {
    expect(await getCafeListMembership(typed(other.client), secondCafeId)).toEqual({
      favorite: false,
      want_to_go: false,
    })
  })
})

describe('RLS（書き込み）', () => {
  it('自分の user_id でだけ追加できる', async () => {
    const cafeId = await insertCafe({ name: '追加テスト店' })

    const { error } = await other.client
      .from('user_cafe_lists')
      .insert({ user_id: other.userId, cafe_id: cafeId, list_type: 'want_to_go' })
    expect(error).toBeNull()
  })

  it('他人の user_id では追加できない', async () => {
    const cafeId = await insertCafe({ name: 'なりすましテスト店' })

    const { error } = await other.client
      .from('user_cafe_lists')
      .insert({ user_id: owner.userId, cafe_id: cafeId, list_type: 'favorite' })
    expect(error?.code).toBe('42501')
  })

  it('suspended は追加できない（is_active_user が偽）', async () => {
    const cafeId = await insertCafe({ name: '停止中ユーザーのテスト店' })

    const { error } = await suspended.client
      .from('user_cafe_lists')
      .insert({ user_id: suspended.userId, cafe_id: cafeId, list_type: 'favorite' })
    expect(error?.code).toBe('42501')
  })

  it('suspended でも解除はできる（自分のリストから外せない状態に閉じ込めない）', async () => {
    const cafeId = await insertCafe({ name: '停止中ユーザーの解除テスト店' })
    await addToList(suspended.userId, cafeId, 'favorite')

    const { error } = await suspended.client
      .from('user_cafe_lists')
      .delete()
      .eq('cafe_id', cafeId)
      .eq('list_type', 'favorite')
    expect(error).toBeNull()

    const { count } = await service
      .from('user_cafe_lists')
      .select('cafe_id', { count: 'exact', head: true })
      .eq('user_id', suspended.userId)
    expect(count).toBe(0)
  })

  it('UPDATE はポリシーが無いので通らない（メモ編集は未実装）', async () => {
    const { data } = await owner.client
      .from('user_cafe_lists')
      .update({ note: '書き換え' })
      .eq('cafe_id', activeCafeId)
      .eq('list_type', 'favorite')
      .select('cafe_id')

    // ポリシー不在の UPDATE はエラーではなく「0件の成功」で返る
    expect(data ?? []).toEqual([])
  })

  it('他人の行は削除できない（0件の成功で返る）', async () => {
    const { error } = await other.client
      .from('user_cafe_lists')
      .delete()
      .eq('user_id', owner.userId)
      .eq('cafe_id', activeCafeId)
    expect(error).toBeNull()

    const { count } = await service
      .from('user_cafe_lists')
      .select('cafe_id', { count: 'exact', head: true })
      .eq('user_id', owner.userId)
      .eq('cafe_id', activeCafeId)
      .eq('list_type', 'favorite')
    expect(count).toBe(1)
  })

  it('同じ (user, cafe, list_type) の二重登録は主キー違反', async () => {
    const { error } = await owner.client
      .from('user_cafe_lists')
      .insert({ user_id: owner.userId, cafe_id: activeCafeId, list_type: 'favorite' })
    expect(error?.code).toBe('23505')
  })

  it('list_type は2値のみ（CHECK 制約）', async () => {
    const { error } = await owner.client
      .from('user_cafe_lists')
      .insert({ user_id: owner.userId, cafe_id: secondCafeId, list_type: 'bookmark' })
    expect(error?.code).toBe('23514')
  })
})
