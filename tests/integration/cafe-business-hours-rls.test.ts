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
let admin: AuthedUser
let suspendedOwner: AuthedUser

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
  alice = await createAuthedProfile({ username: 'alice_hours' })
  bob = await createAuthedProfile({ username: 'bob_hours' })
  admin = await createAuthedProfile({ username: 'admin_hours', role: 'admin' })
  suspendedOwner = await createAuthedProfile({ username: 'suspended_hours', status: 'suspended' })
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
  await suspendedOwner?.cleanup()
})

describe('cafe_business_hours の SELECT', () => {
  it('未ログインでも読める', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })
    await service.from('cafe_business_hours').insert({
      cafe_id: cafeId,
      day_of_week: 1,
      opens_at: '09:00',
      closes_at: '18:00',
    })

    const { data, error } = await anon
      .from('cafe_business_hours')
      .select('day_of_week, opens_at, closes_at')
      .eq('cafe_id', cafeId)

    expect(error).toBeNull()
    expect(data).toEqual([{ day_of_week: 1, opens_at: '09:00:00', closes_at: '18:00:00' }])
  })
})

describe('cafe_business_hours の INSERT', () => {
  it('verified_owner_id 本人は自分のカフェの営業時間を登録できる', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })

    const { error } = await bob.client
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 0, is_closed: true })

    expect(error).toBeNull()
  })

  it('verified_owner_id ではないユーザーは登録できない', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })

    const { error } = await alice.client
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 0, is_closed: true })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('未ログインは登録できない', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })

    const { error } = await anon
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 0, is_closed: true })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('admin は誰のカフェでも登録できる', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })

    const { error } = await admin.client
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 0, is_closed: true })

    expect(error).toBeNull()
  })

  it('status=suspended のオーナーは自分のカフェでも登録できない', async () => {
    const cafeId = await insertCafe({ verified_owner_id: suspendedOwner.userId })

    const { error } = await suspendedOwner.client
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 0, is_closed: true })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('定休日でないのに営業時間が両方未設定だと登録できない', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })

    const { error } = await bob.client
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 1, is_closed: false })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('day_of_week が範囲外だと登録できない', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })

    const { error } = await bob.client
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 7, is_closed: true })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })
})

describe('cafe_business_hours の UPDATE', () => {
  it('verified_owner_id 本人は更新できる', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })
    await service
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 2, is_closed: true })

    const { data, error } = await bob.client
      .from('cafe_business_hours')
      .update({ is_closed: false, opens_at: '10:00', closes_at: '20:00' })
      .eq('cafe_id', cafeId)
      .eq('day_of_week', 2)
      .select('is_closed')

    expect(error).toBeNull()
    expect(data).toEqual([{ is_closed: false }])
  })

  it('status=suspended のオーナーは自分のカフェでも更新できない（対象0件）', async () => {
    const cafeId = await insertCafe({ verified_owner_id: suspendedOwner.userId })
    await service
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 2, is_closed: true })

    const { data, error } = await suspendedOwner.client
      .from('cafe_business_hours')
      .update({ is_closed: false, opens_at: '10:00', closes_at: '20:00' })
      .eq('cafe_id', cafeId)
      .eq('day_of_week', 2)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('verified_owner_id ではないユーザーは更新できない（対象0件）', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })
    await service
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 2, is_closed: true })

    const { data, error } = await alice.client
      .from('cafe_business_hours')
      .update({ is_closed: false })
      .eq('cafe_id', cafeId)
      .eq('day_of_week', 2)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('cafe_business_hours の DELETE', () => {
  it('verified_owner_id 本人は削除できる', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })
    await service
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 3, is_closed: true })

    const { data, error } = await bob.client
      .from('cafe_business_hours')
      .delete()
      .eq('cafe_id', cafeId)
      .eq('day_of_week', 3)
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('verified_owner_id ではないユーザーは削除できない（対象0件）', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })
    await service
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 3, is_closed: true })

    const { data, error } = await alice.client
      .from('cafe_business_hours')
      .delete()
      .eq('cafe_id', cafeId)
      .eq('day_of_week', 3)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('カフェ削除時に営業時間も連鎖削除される', async () => {
    const cafeId = await insertCafe({ verified_owner_id: bob.userId })
    await service
      .from('cafe_business_hours')
      .insert({ cafe_id: cafeId, day_of_week: 4, is_closed: true })

    await service.from('cafes').delete().eq('id', cafeId)
    cafeIds.length = 0

    const { data } = await service.from('cafe_business_hours').select().eq('cafe_id', cafeId)
    expect(data).toEqual([])
  })
})
