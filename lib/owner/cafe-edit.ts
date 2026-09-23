import type { SupabaseClient } from '@supabase/supabase-js'
import { toBusinessHour } from '@/lib/cafes/cafe-detail'
import type { Database } from '@/types/database'

/**
 * S_OWNER_CAFE_EDIT のプリフィル読み取り。
 *
 * カフェ本体は get_owned_cafe_for_edit（security definer）で取る — cafes の SELECT RLS
 * （cafes_select_active_authenticated）は status='active' しか見せないため、素朴な select
 * だとカフェが closed/hidden の間は本人からも編集画面を開けなくなる
 *   supabase/migrations/20260922233925_get_owned_cafe_for_edit.sql
 *
 * 営業時間は cafe_business_hours_select_all が `using (true)` で誰にでも開いているため、
 * status を問わず素朴な select で問題ない
 */

type Client = SupabaseClient<Database>

export type CafeEditData = {
  id: string
  name: string
  nameKana: string | null
  prefecture: string
  city: string
  areaCode: string | null
  address: string | null
  phone: string | null
  website: string | null
  description: string | null
  externalIds: { googlePlaceId: string; tabelogUrl: string }
  businessHours: ReturnType<typeof toBusinessHour>[]
}

function toExternalIds(value: unknown): { googlePlaceId: string; tabelogUrl: string } {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    googlePlaceId: typeof record.google_place_id === 'string' ? record.google_place_id : '',
    tabelogUrl: typeof record.tabelog_url === 'string' ? record.tabelog_url : '',
  }
}

export async function getOwnedCafeForEdit(
  supabase: Client,
  cafeId: string,
): Promise<CafeEditData | null> {
  const { data: cafeRows, error: cafeError } = await supabase.rpc('get_owned_cafe_for_edit', {
    p_cafe_id: cafeId,
  })
  if (cafeError) throw new Error(`カフェの取得に失敗しました: ${cafeError.message}`)
  const cafe = cafeRows?.[0]
  if (!cafe) return null

  const { data: hours, error: hoursError } = await supabase
    .from('cafe_business_hours')
    .select('day_of_week, opens_at, closes_at, is_closed, notes')
    .eq('cafe_id', cafeId)
    .order('day_of_week', { ascending: true })
  if (hoursError) throw new Error(`営業時間の取得に失敗しました: ${hoursError.message}`)

  return {
    id: cafe.id,
    name: cafe.name,
    nameKana: cafe.name_kana,
    prefecture: cafe.prefecture,
    city: cafe.city,
    areaCode: cafe.area_code,
    address: cafe.address,
    phone: cafe.phone,
    website: cafe.website,
    description: cafe.description,
    externalIds: toExternalIds(cafe.external_ids),
    businessHours: (hours ?? []).map(toBusinessHour),
  }
}
