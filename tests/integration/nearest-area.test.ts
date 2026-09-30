import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { getNearestArea } from '@/lib/areas/nearest'
import type { Database } from '@/types/database'
import { anonClient } from '../helpers/supabase'

// nearest_area（RPC）と lib/areas/nearest.ts を実DBに対して動かす。確認したいのは:
//  1. 渋谷駅に近い座標を渡すと渋谷区が返ること（seed済みの center_location を使う）
//  2. level=ward 以外（sub_area）は候補に出ないこと
//  3. 境界の入力検証（lat/lng の範囲外）で例外にならず null になること

const anon = anonClient()

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

// 渋谷駅。areas.center_location（渋谷区: 35.6619707, 139.703795）に最も近い
const SHIBUYA_STATION = { lat: 35.658, lng: 139.7016 }

describe('getNearestArea', () => {
  it('渋谷駅の座標を渡すと渋谷区が最寄りとして返る', async () => {
    const result = await getNearestArea(typed(anon), SHIBUYA_STATION)

    expect(result).toMatchObject({ areaCode: 'JP-13-shibuya-ku', label: '渋谷区' })
    expect(result?.distanceM).toBeGreaterThanOrEqual(0)
  })

  it('sub_area（表参道等）は候補に出ない — ward より近くても ward が返る', async () => {
    // 表参道の中心に近い座標。sub_area まで候補に含めると表参道が返ってしまう
    const result = await getNearestArea(typed(anon), { lat: 35.667355, lng: 139.707743 })

    expect(result?.areaCode).not.toBe('JP-13-omotesando')
  })

  it('lat/lng が範囲外なら null を返す（例外にしない）', async () => {
    expect(await getNearestArea(typed(anon), { lat: 999, lng: 139.7 })).toBeNull()
  })
})
