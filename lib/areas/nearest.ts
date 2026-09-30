import type { SupabaseClient } from '@supabase/supabase-js'
import { nearestAreaSchema } from '@/lib/validators/areas'
import type { Database } from '@/types/database'

/**
 * S_ONBOARD_AREA の「現在地から検索」が使う「最寄りの区（level=ward）を1件返す」読み取り。
 * lib/cafes/nearby.ts と同じ KNN パターン
 *   docs/design/wireframes/auth.md #S_ONBOARD_AREA
 */

type Client = SupabaseClient<Database>

export type NearestArea = {
  areaCode: string
  label: string
  distanceM: number
}

export type NearestAreaParams = {
  lat: number
  lng: number
}

/**
 * 認可は supabase/migrations/20260930120000_create_nearest_area_function.sql の
 * nearest_area（security invoker）が areas_select_active の RLS に委譲する。
 * ここでは境界の入力検証のみ行う
 */
export async function getNearestArea(
  supabase: Client,
  params: NearestAreaParams,
): Promise<NearestArea | null> {
  const parsed = nearestAreaSchema.safeParse(params)
  if (!parsed.success) return null

  const { data, error } = await supabase.rpc('nearest_area', {
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
  })

  if (error) throw new Error(`最寄りエリアの取得に失敗しました: ${error.message}`)

  const row = data?.[0]
  if (!row) return null

  return { areaCode: row.area_code, label: row.label, distanceM: row.distance_m }
}
