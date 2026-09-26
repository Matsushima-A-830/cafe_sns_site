import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getNearbyCafes } from '@/lib/cafes/nearby'
import type { Database } from '@/types/database'
import { anonClient, serviceRoleClient } from '../helpers/supabase'

// nearby_cafes（RPC）と lib/cafes/nearby.ts を実DBに対して動かす。確認したいのは:
//  1. 距離順（近い順）に並ぶこと
//  2. location が NULL のカフェは出ないこと
//  3. area_code / query の絞り込みが効くこと
//  4. security invoker のため、未ログインでも closed / hidden は RLS で落ちること
//  5. 境界の入力検証（lat/lng の範囲外）で例外にならず空配列になること

const service = serviceRoleClient()
const anon = anonClient()

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

// 渋谷駅を原点に、南北で距離差をつける
const SHIBUYA = { lat: 35.658, lng: 139.7016 }
const point = (lat: number, lng: number) => `SRID=4326;POINT(${lng} ${lat})`

const cafeIds: string[] = []

async function insertCafe(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: 'テスト珈琲店', prefecture: '東京都', city: '渋谷区', ...overrides })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id
}

let nearCafeId: string
let farCafeId: string
let noLocationCafeId: string
let closedNearbyCafeId: string
let hiddenNearbyCafeId: string
let otherAreaCafeId: string

beforeAll(async () => {
  nearCafeId = await insertCafe({
    name: '渋谷駅前カフェ',
    area_code: 'JP-13-shibuya-ku',
    location: point(35.659, 139.702),
  })
  farCafeId = await insertCafe({
    name: '新宿の遠いカフェ',
    area_code: 'JP-13-shibuya-ku',
    location: point(35.69, 139.7),
  })
  noLocationCafeId = await insertCafe({ name: '座標未収集のカフェ', area_code: 'JP-13-shibuya-ku' })
  closedNearbyCafeId = await insertCafe({
    name: '閉店した近くの店',
    area_code: 'JP-13-shibuya-ku',
    status: 'closed',
    location: point(35.6585, 139.7018),
  })
  hiddenNearbyCafeId = await insertCafe({
    name: '非公開の近くの店',
    area_code: 'JP-13-shibuya-ku',
    status: 'hidden',
    location: point(35.6585, 139.7018),
  })
  otherAreaCafeId = await insertCafe({
    name: '渋谷駅前カフェ別館',
    area_code: 'JP-13-shinjuku-ku',
    location: point(35.6585, 139.7018),
  })
})

afterAll(async () => {
  if (cafeIds.length > 0) await service.from('cafes').delete().in('id', cafeIds)
})

describe('getNearbyCafes', () => {
  it('座標のあるカフェだけを距離順（近い順）で返す', async () => {
    const result = await getNearbyCafes(typed(anon), SHIBUYA)
    const ids = result.map((r) => r.cafeId)

    expect(ids).not.toContain(noLocationCafeId)
    const nearIndex = ids.indexOf(nearCafeId)
    const farIndex = ids.indexOf(farCafeId)
    expect(nearIndex).toBeGreaterThanOrEqual(0)
    expect(farIndex).toBeGreaterThan(nearIndex)
  })

  it('closed / hidden は RLS で落ちる（未ログインでも security invoker のまま漏れない）', async () => {
    const result = await getNearbyCafes(typed(anon), SHIBUYA)
    const ids = result.map((r) => r.cafeId)

    expect(ids).not.toContain(closedNearbyCafeId)
    expect(ids).not.toContain(hiddenNearbyCafeId)
  })

  it('area_code で絞り込める', async () => {
    const result = await getNearbyCafes(typed(anon), { ...SHIBUYA, areaCode: 'JP-13-shinjuku-ku' })
    const ids = result.map((r) => r.cafeId)

    expect(ids).toEqual([otherAreaCafeId])
  })

  it('query（カフェ名の部分一致）で絞り込める', async () => {
    const result = await getNearbyCafes(typed(anon), { ...SHIBUYA, query: '駅前カフェ' })
    const ids = result.map((r) => r.cafeId)

    expect(ids).toContain(nearCafeId)
    expect(ids).toContain(otherAreaCafeId)
    expect(ids).not.toContain(farCafeId)
  })

  it('lat/lng が範囲外なら空配列を返す（例外にしない）', async () => {
    expect(await getNearbyCafes(typed(anon), { lat: 999, lng: 139.7 })).toEqual([])
  })

  it('area_label・distance_m・is_verified を含む', async () => {
    const result = await getNearbyCafes(typed(anon), SHIBUYA)
    const near = result.find((r) => r.cafeId === nearCafeId)

    expect(near).toMatchObject({ areaLabel: '渋谷区', isVerified: false })
    expect(near?.distanceM).toBeGreaterThanOrEqual(0)
  })
})
