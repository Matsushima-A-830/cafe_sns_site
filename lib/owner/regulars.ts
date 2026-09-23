import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

// トリガー/plpgsql の raise exception は SQLSTATE P0001 固定（app/_actions/posts.ts と同じ判定）
const RAISED_BY_TRIGGER = 'P0001'

export type RegularCandidate = {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  postCount: number
  commentCount: number
  bookmarkCount: number
  lastActivityAt: string | null
}

export type RegularCustomer = {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  note: string | null
  awardedAt: string
  revokedAt: string | null
}

/**
 * S_OWNER_REGULARS ページヘッダー用。cafes の SELECT RLS は status='active' しか
 * 見せないため、verified_owner_id === 呼び出し元本人 を明示的に検証する
 * （lib/owner/dashboard.ts と同じ理由・同じ形。closed/hidden カフェのオーナーが
 * 開けない既知のギャップも同様に残る。pending-items D55）
 */
export async function getOwnedCafeSummary(
  supabase: Client,
  cafeId: string,
): Promise<{ id: string; name: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: cafe, error } = await supabase
    .from('cafes')
    .select('id, name, verified_owner_id')
    .eq('id', cafeId)
    .maybeSingle()
  if (error) throw new Error(`カフェの取得に失敗しました: ${error.message}`)
  if (!cafe || cafe.verified_owner_id !== user.id) return null

  return { id: cafe.id, name: cafe.name }
}

/**
 * S_OWNER_REGULARS 認定候補タブ。get_regular_candidates は呼び出し元が
 * is_cafe_owner(cafeId)（または admin）でなければ FORBIDDEN を raise するため、
 * 呼び出し元は必ずオーナー本人のセッション付きクライアントを渡す
 */
export async function getRegularCandidates(
  supabase: Client,
  cafeId: string,
): Promise<RegularCandidate[] | null> {
  const { data, error } = await supabase.rpc('get_regular_candidates', { p_cafe_id: cafeId })
  if (error) {
    if (error.code === RAISED_BY_TRIGGER && error.message.includes('FORBIDDEN')) return null
    throw new Error(`常連認定候補の取得に失敗しました: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username ?? '',
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    postCount: row.post_count,
    commentCount: row.comment_count,
    bookmarkCount: row.bookmark_count,
    lastActivityAt: row.last_activity_at,
  }))
}

/**
 * 常連タブ（revoked_at is null）・認定履歴タブ（全件）共用。
 * regular_customers_select_owner（is_cafe_owner）に認可を委譲するので、
 * 呼び出し元がオーナー本人でなければ空配列が返る（エラーにはならない）
 */
export async function listRegularCustomers(
  supabase: Client,
  cafeId: string,
  options: { activeOnly: boolean },
): Promise<RegularCustomer[]> {
  let query = supabase
    .from('regular_customers')
    .select(
      'user_id, note, awarded_at, revoked_at, profile:profiles!regular_customers_user_id_fkey (username, display_name, avatar_url)',
    )
    .eq('cafe_id', cafeId)
    .order('awarded_at', { ascending: false })
  if (options.activeOnly) query = query.is('revoked_at', null)

  const { data, error } = await query
  if (error) throw new Error(`常連一覧の取得に失敗しました: ${error.message}`)

  return (data ?? [])
    .filter((row) => row.profile)
    .map((row) => ({
      userId: row.user_id,
      username: row.profile?.username ?? '',
      displayName: row.profile?.display_name ?? '',
      avatarUrl: row.profile?.avatar_url ?? null,
      note: row.note,
      awardedAt: row.awarded_at,
      revokedAt: row.revoked_at,
    }))
}
