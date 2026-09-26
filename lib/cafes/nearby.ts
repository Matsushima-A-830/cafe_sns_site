import type { SupabaseClient } from '@supabase/supabase-js'
import { nearbyCafesSchema } from '@/lib/validators/cafes'
import type { Database } from '@/types/database'

/**
 * S_MAP の地図・一覧が使う「座標を持つカフェを距離順に取得する」読み取り。
 * cafe-detail.ts と同じく、Server Component / Server Action から呼ぶ純粋な読み取りはここに置く
 *   docs/design/wireframes/browsing.md #S_MAP
 */

type Client = SupabaseClient<Database>

export type NearbyCafe = {
  cafeId: string
  name: string
  areaCode: string | null
  areaLabel: string | null
  lat: number
  lng: number
  distanceM: number
  isVerified: boolean
}

export type NearbyCafesParams = {
  lat: number
  lng: number
  areaCode?: string
  query?: string
  limit?: number
}

/**
 * 認可は supabase/migrations/20260926224028_create_nearby_cafes_function.sql の
 * nearby_cafes（security invoker）が cafes の RLS に委譲する。ここでは境界の入力検証のみ行う
 */
export async function getNearbyCafes(
  supabase: Client,
  params: NearbyCafesParams,
): Promise<NearbyCafe[]> {
  const parsed = nearbyCafesSchema.safeParse(params)
  if (!parsed.success) return []

  const { data, error } = await supabase.rpc('nearby_cafes', {
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
    p_area_code: parsed.data.areaCode,
    p_query: parsed.data.query,
    p_limit: parsed.data.limit ?? 100,
  })

  if (error) throw new Error(`近くのカフェの取得に失敗しました: ${error.message}`)

  return (data ?? []).map((row) => ({
    cafeId: row.cafe_id,
    name: row.name,
    areaCode: row.area_code,
    areaLabel: row.area_label,
    lat: row.lat,
    lng: row.lng,
    distanceM: row.distance_m,
    isVerified: row.is_verified,
  }))
}
