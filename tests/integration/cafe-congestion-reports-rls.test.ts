import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const CHECK_VIOLATION = '23514'

const anon = anonClient()
const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser

const cafeIds: string[] = []

async function insertCafe(overrides: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from('cafes')
    .insert({
      name: 'テストカフェ',
      prefecture: '東京都',
      city: '渋谷区',
      ...overrides,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id as string
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_congestion' })
  bob = await createAuthedProfile({ username: 'bob_congestion' })
})

afterEach(async () => {
  if (cafeIds.length > 0) {
    await service.from('cafes').delete().in('id', cafeIds)
    cafeIds.length = 0
  }
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
})

describe('cafe_congestion_reports の SELECT', () => {
  it('未ログインでも読める', async () => {
    const cafeId = await insertCafe()
    await service
      .from('cafe_congestion_reports')
      .insert({ cafe_id: cafeId, user_id: alice.userId, level: 3 })

    const { data, error } = await anon
      .from('cafe_congestion_reports')
      .select('level')
      .eq('cafe_id', cafeId)

    expect(error).toBeNull()
    expect(data).toEqual([{ level: 3 }])
  })
})

describe('cafe_congestion_reports の INSERT', () => {
  it('認証済みユーザーは自分を user_id として報告できる', async () => {
    const cafeId = await insertCafe()

    const { error } = await alice.client
      .from('cafe_congestion_reports')
      .insert({ cafe_id: cafeId, user_id: alice.userId, level: 4 })

    expect(error).toBeNull()
  })

  it('他人を user_id に仕立てて報告できない', async () => {
    const cafeId = await insertCafe()

    const { error } = await alice.client
      .from('cafe_congestion_reports')
      .insert({ cafe_id: cafeId, user_id: bob.userId, level: 4 })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('未ログインは報告できない', async () => {
    const cafeId = await insertCafe()

    const { error } = await anon
      .from('cafe_congestion_reports')
      .insert({ cafe_id: cafeId, user_id: alice.userId, level: 4 })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('level が範囲外だと報告できない', async () => {
    const cafeId = await insertCafe()

    const { error } = await alice.client
      .from('cafe_congestion_reports')
      .insert({ cafe_id: cafeId, user_id: alice.userId, level: 6 })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })
})

describe('cafe_congestion_reports の UPDATE・DELETE', () => {
  it('本人でも更新できない（対象0件）', async () => {
    const cafeId = await insertCafe()
    const { data: inserted } = await service
      .from('cafe_congestion_reports')
      .insert({ cafe_id: cafeId, user_id: alice.userId, level: 3 })
      .select('id')
      .single()

    const { data, error } = await alice.client
      .from('cafe_congestion_reports')
      .update({ level: 5 })
      .eq('id', inserted?.id as string)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('本人でも削除できない（対象0件）', async () => {
    const cafeId = await insertCafe()
    const { data: inserted } = await service
      .from('cafe_congestion_reports')
      .insert({ cafe_id: cafeId, user_id: alice.userId, level: 3 })
      .select('id')
      .single()

    const { data, error } = await alice.client
      .from('cafe_congestion_reports')
      .delete()
      .eq('id', inserted?.id as string)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('get_cafe_congestion_current', () => {
  it('直近30分以内のレポートがあれば recent を返す', async () => {
    const cafeId = await insertCafe()
    await service.from('cafe_congestion_reports').insert([
      { cafe_id: cafeId, user_id: alice.userId, level: 2, reported_at: new Date().toISOString() },
      { cafe_id: cafeId, user_id: bob.userId, level: 4, reported_at: new Date().toISOString() },
    ])

    const { data, error } = await anon.rpc('get_cafe_congestion_current', { p_cafe_id: cafeId })

    expect(error).toBeNull()
    expect(data?.[0]).toMatchObject({ level_avg: 3, source: 'recent', sample_count: 2 })
  })

  it('直近レポートがなく過去に同曜日同時間帯のデータがあれば historical を正しい件数で返す', async () => {
    const cafeId = await insertCafe()
    // ちょうど1週間前 = 同じ曜日・同じ時刻（同曜日同時間帯判定に必ず一致させるため）
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await service.from('cafe_congestion_reports').insert([
      { cafe_id: cafeId, user_id: alice.userId, level: 5, reported_at: oneWeekAgo },
      { cafe_id: cafeId, user_id: bob.userId, level: 3, reported_at: oneWeekAgo },
    ])

    const { data, error } = await anon.rpc('get_cafe_congestion_current', { p_cafe_id: cafeId })

    expect(error).toBeNull()
    expect(data?.[0]).toMatchObject({ level_avg: 4, source: 'historical', sample_count: 2 })
  })

  it('直近レポートがなく過去データもなければ none を返す', async () => {
    const cafeId = await insertCafe()

    const { data, error } = await anon.rpc('get_cafe_congestion_current', { p_cafe_id: cafeId })

    expect(error).toBeNull()
    expect(data?.[0]).toMatchObject({ level_avg: null, source: 'none', sample_count: 0 })
  })
})
