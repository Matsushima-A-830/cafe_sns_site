import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'
const CHECK_VIOLATION = '23514'

const anon = anonClient()
const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let admin: AuthedUser
let suspendedUser: AuthedUser

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
  alice = await createAuthedProfile({ username: 'alice_cafe' })
  bob = await createAuthedProfile({ username: 'bob_cafe' })
  admin = await createAuthedProfile({ username: 'admin_cafe', role: 'admin' })
  suspendedUser = await createAuthedProfile({ username: 'suspended_cafe', status: 'suspended' })
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
  await admin?.cleanup()
  await suspendedUser?.cleanup()
})

describe('cafes の SELECT', () => {
  it('未ログインでも status=active のカフェを読める', async () => {
    const id = await insertCafe({ name: '公開カフェ', status: 'active' })

    const { data, error } = await anon.from('cafes').select('name').eq('id', id)

    expect(error).toBeNull()
    expect(data).toEqual([{ name: '公開カフェ' }])
  })

  it('status=hidden のカフェは一般ユーザーから見えない', async () => {
    const id = await insertCafe({ name: '非公開カフェ', status: 'hidden' })

    const { data, error } = await alice.client.from('cafes').select('name').eq('id', id)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('admin は status=hidden のカフェも見える', async () => {
    const id = await insertCafe({ name: '非公開カフェ', status: 'hidden' })

    const { data, error } = await admin.client.from('cafes').select('name').eq('id', id)

    expect(error).toBeNull()
    expect(data).toEqual([{ name: '非公開カフェ' }])
  })
})

describe('cafes の INSERT', () => {
  it('認証済みユーザーは自分を created_by として登録できる', async () => {
    const { data, error } = await alice.client
      .from('cafes')
      .insert({
        name: '新規カフェ',
        prefecture: '東京都',
        city: '渋谷区',
        created_by: alice.userId,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    if (data) cafeIds.push(data.id)
  })

  it('未ログインは登録できない', async () => {
    const { error } = await anon
      .from('cafes')
      .insert({ name: '侵入カフェ', prefecture: '東京都', city: '渋谷区' })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('他人を created_by に仕立てて登録できない', async () => {
    const { error } = await alice.client.from('cafes').insert({
      name: 'なりすましカフェ',
      prefecture: '東京都',
      city: '渋谷区',
      created_by: bob.userId,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('status=suspended のユーザーは自分を created_by としても登録できない', async () => {
    const { error } = await suspendedUser.client.from('cafes').insert({
      name: '停止中ユーザーのカフェ',
      prefecture: '東京都',
      city: '渋谷区',
      created_by: suspendedUser.userId,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('created_by を省略（NULL）した登録は弾かれる', async () => {
    const { error } = await alice.client
      .from('cafes')
      .insert({ name: 'created_by 未指定カフェ', prefecture: '東京都', city: '渋谷区' })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('status に不正な値は登録できない', async () => {
    const { error } = await service.from('cafes').insert({
      name: '不正ステータスカフェ',
      prefecture: '東京都',
      city: '渋谷区',
      status: 'deleted',
    })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('登録時に自分を verified_owner_id として送り込めない（自称オーナー防止）', async () => {
    const { error } = await alice.client.from('cafes').insert({
      name: '自称オーナーカフェ',
      prefecture: '東京都',
      city: '渋谷区',
      created_by: alice.userId,
      verified_owner_id: alice.userId,
    })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('admin は登録時に verified_owner_id を指定できる', async () => {
    const { data, error } = await admin.client
      .from('cafes')
      .insert({
        name: '認証済みカフェ',
        prefecture: '東京都',
        city: '渋谷区',
        created_by: admin.userId,
        verified_owner_id: bob.userId,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    if (data) cafeIds.push(data.id)
  })
})

describe('cafes の UPDATE', () => {
  it('verified_owner_id 本人は自分のカフェを更新できる', async () => {
    const id = await insertCafe({ verified_owner_id: bob.userId })

    const { data, error } = await bob.client
      .from('cafes')
      .update({ description: 'ボブの店です' })
      .eq('id', id)
      .select('description')

    expect(error).toBeNull()
    expect(data).toEqual([{ description: 'ボブの店です' }])
  })

  it('status=suspended のオーナーは自分のカフェでも更新できない（対象0件）', async () => {
    const id = await insertCafe({ verified_owner_id: suspendedUser.userId })

    const { data, error } = await suspendedUser.client
      .from('cafes')
      .update({ description: '停止中オーナーの更新' })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('verified_owner_id ではないユーザーは更新できない（対象0件）', async () => {
    const id = await insertCafe({ verified_owner_id: bob.userId })

    const { data, error } = await alice.client
      .from('cafes')
      .update({ description: '乗っ取り' })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('verified_owner_id 本人でも自分でオーナー権を他人に譲渡できない', async () => {
    const id = await insertCafe({ verified_owner_id: bob.userId })

    const { error } = await bob.client
      .from('cafes')
      .update({ verified_owner_id: alice.userId })
      .eq('id', id)

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('admin は verified_owner_id を付け替えられる', async () => {
    const id = await insertCafe({ verified_owner_id: bob.userId })

    const { data, error } = await admin.client
      .from('cafes')
      .update({ verified_owner_id: alice.userId })
      .eq('id', id)
      .select('verified_owner_id')

    expect(error).toBeNull()
    expect(data).toEqual([{ verified_owner_id: alice.userId }])
  })

  it('未ログインは更新できない（対象0件）', async () => {
    const id = await insertCafe({ verified_owner_id: bob.userId })

    const { data, error } = await anon
      .from('cafes')
      .update({ description: '侵入' })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('登録者本人は verified_owner_id 未設定の自分のカフェを更新できる（B8）', async () => {
    const id = await insertCafe({ created_by: alice.userId, verified_owner_id: null })

    const { data, error } = await alice.client
      .from('cafes')
      .update({ description: '登録者本人による修正' })
      .eq('id', id)
      .select('description')

    expect(error).toBeNull()
    expect(data).toEqual([{ description: '登録者本人による修正' }])
  })

  it('status=suspended の登録者は自分のカフェでも更新できない（対象0件）', async () => {
    const id = await insertCafe({
      created_by: suspendedUser.userId,
      verified_owner_id: null,
    })

    const { data, error } = await suspendedUser.client
      .from('cafes')
      .update({ description: '停止中登録者の更新' })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('オーナー認証済み（verified_owner_id 設定済み）になると登録者本人は更新できなくなる', async () => {
    const id = await insertCafe({ created_by: alice.userId, verified_owner_id: bob.userId })

    const { data, error } = await alice.client
      .from('cafes')
      .update({ description: 'オーナー確定後の登録者による更新' })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('登録者本人ではないユーザーは、未認証カフェでも更新できない（対象0件）', async () => {
    const id = await insertCafe({ created_by: alice.userId, verified_owner_id: null })

    const { data, error } = await bob.client
      .from('cafes')
      .update({ description: '他人による乗っ取り' })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('updated_at はトリガーで自動更新される', async () => {
    const id = await insertCafe({ verified_owner_id: bob.userId })
    const before = await service.from('cafes').select('updated_at').eq('id', id).single()

    await new Promise((resolve) => setTimeout(resolve, 10))
    await bob.client.from('cafes').update({ description: '更新した' }).eq('id', id)

    const after = await service.from('cafes').select('updated_at').eq('id', id).single()
    expect(new Date(after.data?.updated_at as string).getTime()).toBeGreaterThan(
      new Date(before.data?.updated_at as string).getTime(),
    )
  })
})

describe('cafes の DELETE', () => {
  it('verified_owner_id 本人でも削除できない（対象0件）', async () => {
    const id = await insertCafe({ verified_owner_id: bob.userId })

    const { data, error } = await bob.client.from('cafes').delete().eq('id', id).select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('未ログインは削除できない（対象0件）', async () => {
    const id = await insertCafe()

    const { data, error } = await anon.from('cafes').delete().eq('id', id).select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('admin は削除できる', async () => {
    const id = await insertCafe()

    const { data, error } = await admin.client.from('cafes').delete().eq('id', id).select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    cafeIds.length = 0
  })
})
