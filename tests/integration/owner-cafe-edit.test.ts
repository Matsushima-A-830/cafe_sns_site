import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getOwnedCafeForEdit } from '@/lib/owner/cafe-edit'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// getOwnedCafeForEdit（get_owned_cafe_for_edit RPC）を実DBに対して動かす。確認したいのは:
//  1. verified_owner_id 本人なら status に関わらず（active/closed/hidden）取得できる
//     （落とし穴1: 素朴な select だと closed/hidden の間は本人からも編集画面が開けなくなる）
//  2. 他人のカフェ・未ログイン・存在しないIDは null
//  3. 営業時間が曜日順で付いてくる

const service = serviceRoleClient()
const anon = anonClient()

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

let owner: AuthedUser
let otherOwner: AuthedUser

const cafeIds: string[] = []

async function insertCafe(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await service
    .from('cafes')
    .insert({
      name: '編集対象カフェ',
      prefecture: '東京都',
      city: '渋谷区',
      external_ids: { google_place_id: 'ChIJxxx', tabelog_url: 'https://tabelog.com/xxx' },
      ...overrides,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id
}

beforeAll(async () => {
  owner = await createAuthedProfile({ username: 'owner_cafe_edit', role: 'owner' })
  otherOwner = await createAuthedProfile({ username: 'other_owner_cafe_edit', role: 'owner' })
})

afterEach(async () => {
  if (cafeIds.length > 0) {
    await service.from('cafe_business_hours').delete().in('cafe_id', cafeIds)
    await service.from('cafes').delete().in('id', cafeIds)
    cafeIds.length = 0
  }
})

afterAll(async () => {
  await owner?.cleanup()
  await otherOwner?.cleanup()
})

describe('getOwnedCafeForEdit', () => {
  it('未ログインは null', async () => {
    const id = await insertCafe({ verified_owner_id: owner.userId })
    expect(await getOwnedCafeForEdit(typed(anon), id)).toBeNull()
  })

  it('他人のカフェは null', async () => {
    const id = await insertCafe({ verified_owner_id: owner.userId })
    expect(await getOwnedCafeForEdit(typed(otherOwner.client), id)).toBeNull()
  })

  it('存在しないカフェは null', async () => {
    expect(await getOwnedCafeForEdit(typed(owner.client), crypto.randomUUID())).toBeNull()
  })

  it('status=active の自分のカフェをフル列で取得できる', async () => {
    const id = await insertCafe({ verified_owner_id: owner.userId, status: 'active' })

    const cafe = await getOwnedCafeForEdit(typed(owner.client), id)

    expect(cafe).toMatchObject({
      id,
      name: '編集対象カフェ',
      externalIds: { googlePlaceId: 'ChIJxxx', tabelogUrl: 'https://tabelog.com/xxx' },
    })
  })

  it('status=closed でも本人は取得できる（落とし穴1: D55と同じ罠を再現しない）', async () => {
    const id = await insertCafe({ verified_owner_id: owner.userId, status: 'closed' })
    expect(await getOwnedCafeForEdit(typed(owner.client), id)).toMatchObject({ id })
  })

  it('status=hidden でも本人は取得できる（落とし穴1: D55と同じ罠を再現しない）', async () => {
    const id = await insertCafe({ verified_owner_id: owner.userId, status: 'hidden' })
    expect(await getOwnedCafeForEdit(typed(owner.client), id)).toMatchObject({ id })
  })

  it('営業時間を曜日順で返す', async () => {
    const id = await insertCafe({ verified_owner_id: owner.userId })
    const { error } = await service.from('cafe_business_hours').insert([
      { cafe_id: id, day_of_week: 2, opens_at: '08:00', closes_at: '18:00', is_closed: false },
      { cafe_id: id, day_of_week: 0, opens_at: null, closes_at: null, is_closed: true },
    ])
    if (error) throw new Error(`テスト用 cafe_business_hours の作成に失敗: ${error.message}`)

    const cafe = await getOwnedCafeForEdit(typed(owner.client), id)

    expect(cafe?.businessHours.map((hour) => hour.dayOfWeek)).toEqual([0, 2])
    expect(cafe?.businessHours[1]).toMatchObject({ opensAt: '08:00:00', closesAt: '18:00:00' })
  })
})
