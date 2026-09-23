import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * ユーザーの「行きつけ」（regular_customers、現在有効な常連認定のみ）の読み取り。
 * S_USER_PROFILE_PUBLIC の行きつけタブ・S_MYPAGE のプレビュー・/me/regulars から使う
 *   docs/architecture/data-model/tables.md #regular_customers
 */

type Client = SupabaseClient<Database>

/** マイページ中段プレビュー（ワイヤーは3件） */
export const REGULAR_CAFE_PREVIEW_LIMIT = 3
/** /me/regulars の一覧はページ送り未実装。全件返して固まらないための上限 */
export const REGULAR_CAFE_LIST_LIMIT = 100

export type RegularCafeEntry = {
  cafeId: string
  name: string
  areaLabel: string | null
  awardedAt: string
}

/**
 * `cafes!inner` が必須。regular_customers_select_active は revoked_at のみで絞り、
 * 埋め込んだ cafes は cafes_select_active_* が status='active' で絞る。外側 join だと
 * 閉店・非公開の店が「行きつけ行はあるが cafes が null」の空カードとして残ってしまう
 *   lib/cafes/user-cafe-lists.ts と同じ理由
 */
const REGULAR_SELECT = `
  cafe_id, awarded_at,
  cafes!inner (id, name, prefecture, city, areas!cafes_area_code_fkey (label))
` as const

type RegularRow = {
  cafe_id: string
  awarded_at: string
  cafes: {
    id: string
    name: string
    prefecture: string
    city: string
    areas: { label: string } | null
  }
}

function toEntry(row: RegularRow): RegularCafeEntry {
  return {
    cafeId: row.cafe_id,
    name: row.cafes.name,
    areaLabel: row.cafes.areas?.label ?? `${row.cafes.prefecture}${row.cafes.city}`,
    awardedAt: row.awarded_at,
  }
}

/**
 * regular_customers_select_active は全ユーザーに公開（revoked_at is null のみで絞る）ため、
 * user_id を渡すだけで本人以外のセッション・匿名セッションからも正しく取れる。
 * security definer 関数は不要
 *   supabase/migrations/20260923010000_create_regular_customers.sql regular_customers_select_active
 */
export async function getUserRegularCafes(
  supabase: Client,
  userId: string,
  limit = REGULAR_CAFE_LIST_LIMIT,
): Promise<RegularCafeEntry[]> {
  const { data, error } = await supabase
    .from('regular_customers')
    .select(REGULAR_SELECT)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('awarded_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`行きつけの取得に失敗しました: ${error.message}`)
  return ((data ?? []) as unknown as RegularRow[]).map(toEntry)
}

/**
 * 一覧（getUserRegularCafes）と必ず同じ条件で数える。cafes!inner を省くと
 * 閉店・非公開の店が件数だけに残り、「3」と出しているのに2件しか並ばない状態になる
 */
export async function getUserRegularCafeCount(supabase: Client, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('regular_customers')
    .select('cafe_id, cafes!inner (id)', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)

  if (error) throw new Error(`行きつけの件数取得に失敗しました: ${error.message}`)
  return count ?? 0
}
