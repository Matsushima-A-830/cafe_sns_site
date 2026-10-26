import type { SupabaseClient } from '@supabase/supabase-js'
import { cache } from 'react'
import type { BusinessHour } from '@/lib/cafes/business-hours'
import { getCafeImagePublicUrl } from '@/lib/storage/cafe-images'
import { getPostImagePublicUrl } from '@/lib/storage/post-images'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { cafeIdSchema } from '@/lib/validators/cafes'
import type { Database } from '@/types/database'

/**
 * カフェ詳細（S_CAFE_DETAIL）の読み取り。投稿詳細・プロフィールと同じく
 * Server Component から呼ぶ純粋な読み取りなのでここに置く
 *   docs/design/wireframes/browsing.md #S_CAFE_DETAIL
 */

type Client = SupabaseClient<Database>

/**
 * 1リクエスト内で同じ supabase インスタンスに対して呼べば auth.getUser() の
 * Auth サーバーへの往復を1回に重複排除する（getSupabase/loadCafe と同じ cache() パターン、
 * app/(browsing)/cafes/[id]/page.tsx 参照）。本人判定後にページ側も同じユーザーを
 * 必要とするため、呼び出し元と共有できるようここで export する
 */
export const getCachedUser = cache((supabase: Client) => supabase.auth.getUser())

/**
 * 公開してよい列だけを列挙する。external_ids（外部サービスのID）・metadata・created_by は
 * 表示に使わないので取らない。status の絞り込みは RLS が担うので列も要らない。
 * location は直接 select すると WKB hex しか返らないため、
 * cafe_lat/cafe_lng（20260928131058_add_cafe_lat_lng_computed_columns.sql の
 * computed column）経由で緯度経度だけを取る
 */
const CAFE_COLUMNS = `
  id, name, prefecture, city, address, phone, website, description,
  verified_owner_id, cafe_lat, cafe_lng, main_image_path,
  areas!cafes_area_code_fkey (label)
` as const

export type CafeDetail = {
  id: string
  name: string
  areaLabel: string | null
  address: string | null
  phone: string | null
  website: string | null
  description: string | null
  /** そのカフェの最新投稿の1枚目。投稿0件なら null（pending-items D31） */
  heroImageUrl: string | null
  /** 認証済みオーナーが付いていれば「✓公式」を出す */
  isVerified: boolean
  businessHours: BusinessHour[]
  /** 座標未収集のカフェは null（バックフィル未実施分、pending-items D63） */
  location: { lat: number; lng: number } | null
}

type CafeRow = {
  id: string
  name: string
  prefecture: string
  city: string
  address: string | null
  phone: string | null
  website: string | null
  description: string | null
  verified_owner_id: string | null
  cafe_lat: number | null
  cafe_lng: number | null
  main_image_path: string | null
  areas: { label: string } | null
}

/** get_owned_cafe_detail RPC の行。埋め込み join が使えないため area_label を直接持つ */
type OwnedCafeDetailRow = {
  id: string
  name: string
  prefecture: string
  city: string
  address: string | null
  phone: string | null
  website: string | null
  description: string | null
  verified_owner_id: string | null
  cafe_lat: number | null
  cafe_lng: number | null
  area_label: string | null
  main_image_path: string | null
}

type CafeCore = Omit<CafeDetail, 'heroImageUrl' | 'businessHours'> & {
  /** resolveHeroImageUrl に渡すためだけの中間値。CafeDetail には出さない */
  mainImagePath: string | null
}

function toCafeCore(cafe: CafeRow | OwnedCafeDetailRow, areaLabel: string | null): CafeCore {
  return {
    id: cafe.id,
    name: cafe.name,
    // エリア名が無いカフェ（area_code 未設定）は市区町村で代替する（composer と同じ）
    areaLabel: areaLabel ?? `${cafe.prefecture}${cafe.city}`,
    address: cafe.address,
    phone: cafe.phone,
    website: cafe.website,
    description: cafe.description,
    isVerified: cafe.verified_owner_id !== null,
    location:
      cafe.cafe_lat !== null && cafe.cafe_lng !== null
        ? { lat: cafe.cafe_lat, lng: cafe.cafe_lng }
        : null,
    mainImagePath: cafe.main_image_path,
  }
}

type BusinessHourRow = {
  day_of_week: number
  opens_at: string | null
  closes_at: string | null
  is_closed: boolean
  notes: string | null
}

export function toBusinessHour(row: BusinessHourRow): BusinessHour {
  return {
    dayOfWeek: row.day_of_week,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    isClosed: row.is_closed,
    notes: row.notes,
  }
}

/**
 * ヒーロー画像は main_image_path（オーナーが設定したメイン画像）を優先し、
 * 未設定なら「そのカフェの最新投稿の1枚目」にフォールバックする
 *   docs/architecture/data-model/tables.md #cafes main_image_path の用途
 *
 * 表示する URL は必ず isStoragePublicUrl を通す（保存された値は信頼できない。
 * main_image_path 自体は updateCafe が cafe-images バケットのパスのみ書き込む設計だが、
 * avatar_url と同じ理由で値そのものは信頼しない）
 */
async function resolveHeroImageUrl(
  supabase: Client,
  cafeId: string,
  mainImagePath: string | null,
): Promise<string | null> {
  if (mainImagePath) {
    const mainImageUrl = getCafeImagePublicUrl(supabase, mainImagePath)
    if (isStoragePublicUrl(mainImageUrl)) return mainImageUrl
  }

  // 投稿グリッドと同じ条件で絞る。ここを省くと予約行・論理削除済みの画像が表に出る
  const { data, error } = await supabase
    .from('posts')
    .select('post_images (storage_path, display_order)')
    .eq('cafe_id', cafeId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('display_order', { referencedTable: 'post_images', ascending: true })
    .limit(1, { referencedTable: 'post_images' })
    .limit(5)

  if (error) throw new Error(`カフェのヒーロー画像の取得に失敗しました: ${error.message}`)

  // 写真なしの短文投稿が最新だと1枚目が空になるので、数件見て最初に見つかったものを使う
  const path = (data ?? [])
    .flatMap((row) => row.post_images)
    .map((image) => image.storage_path)
    .find(Boolean)
  if (!path) return null

  const url = getPostImagePublicUrl(supabase, path)
  return isStoragePublicUrl(url) ? url : null
}

/**
 * カフェ1件と営業時間をまとめて取る。
 *
 * status の絞り込みは書かない。cafes_select_active_anon / _authenticated が
 * `status='active'`（admin のみ例外）で行を絞るため、closed / hidden と存在しないIDは
 * どちらも0件になり、呼び出し元は notFound() に落とすだけでよい。
 * 逆に cafe_business_hours_select_all は `using (true)` なので、営業時間から先に引くと
 * hidden なカフェのものまで読めてしまう。必ずカフェ本体を先に確定させる。
 *
 * 素朴な select が null を返した場合（closed/hidden で RLS に落とされた、または
 * 存在しない）、get_owned_cafe_detail（security definer）で本人のカフェかだけ
 * 追加確認する。anon・他人のカフェ・存在しないIDはそこでも null のまま
 *   docs/product/pending-items.md D55
 */
export async function getCafeDetail(supabase: Client, cafeId: string): Promise<CafeDetail | null> {
  // 形が不正だと PostgREST の 22P02（invalid input syntax for uuid）になるので先に弾く
  if (!cafeIdSchema.safeParse({ cafeId }).success) return null

  const { data, error } = await supabase
    .from('cafes')
    .select(CAFE_COLUMNS)
    .eq('id', cafeId)
    .maybeSingle()

  if (error) throw new Error(`カフェの取得に失敗しました: ${error.message}`)

  const cafeRow = data as unknown as CafeRow | null
  const cafeCore = cafeRow
    ? toCafeCore(cafeRow, cafeRow.areas?.label ?? null)
    : await resolveOwnedCafeCore(supabase, cafeId)
  if (!cafeCore) return null

  const { mainImagePath, ...core } = cafeCore

  const [hours, heroImageUrl] = await Promise.all([
    supabase
      .from('cafe_business_hours')
      .select('day_of_week, opens_at, closes_at, is_closed, notes')
      .eq('cafe_id', core.id)
      .order('day_of_week', { ascending: true }),
    resolveHeroImageUrl(supabase, core.id, mainImagePath),
  ])

  if (hours.error) throw new Error(`営業時間の取得に失敗しました: ${hours.error.message}`)

  return {
    ...core,
    heroImageUrl,
    businessHours: (hours.data ?? []).map(toBusinessHour),
  }
}

/**
 * 素朴な select が RLS に落とされたときだけ呼ぶ、本人の closed/hidden カフェ向けフォールバック。
 * RPC の EXECUTE 権限は authenticated にしか付けていないため、anon のまま呼ぶと
 * permission denied になる。未ログインは本人である可能性が無いので先に弾いて素通りさせる
 */
async function resolveOwnedCafeCore(supabase: Client, cafeId: string): Promise<CafeCore | null> {
  const {
    data: { user },
  } = await getCachedUser(supabase)
  if (!user) return null

  const { data, error } = await supabase.rpc('get_owned_cafe_detail', { p_cafe_id: cafeId })
  if (error) throw new Error(`カフェの取得に失敗しました: ${error.message}`)

  const cafe = data?.[0]
  if (!cafe) return null
  return toCafeCore(cafe, cafe.area_label)
}

/**
 * 「もっと見る」の絞り込み解決用に、閲覧できるカフェかだけを確かめる軽い問い合わせ。
 * status の判定は getCafeDetail と同じく RLS に委ねる
 */
export async function cafeExists(supabase: Client, cafeId: string): Promise<boolean> {
  if (!cafeIdSchema.safeParse({ cafeId }).success) return false

  const { count, error } = await supabase
    .from('cafes')
    .select('id', { count: 'exact', head: true })
    .eq('id', cafeId)

  if (error) throw new Error(`カフェの取得に失敗しました: ${error.message}`)
  return (count ?? 0) > 0
}

/** ヘッダの「投稿 128件」。投稿グリッド（getPostList）と必ず同じ条件で数える */
export async function getCafePostCount(supabase: Client, cafeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('cafe_id', cafeId)
    .eq('status', 'published')
    .is('deleted_at', null)

  if (error) throw new Error(`カフェの投稿件数の取得に失敗しました: ${error.message}`)
  return count ?? 0
}
