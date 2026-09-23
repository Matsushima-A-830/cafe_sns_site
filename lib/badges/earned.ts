import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * 他人のプロフィール（S_USER_PROFILE_PUBLIC）で使う、獲得済みバッジだけの軽量な読み取り。
 * getAllBadgeProgress（lib/badges/progress.ts）は未獲得ぶんの集計まで20バッジ全件走らせる
 * 設計で、/me/badges 向け。ここでは user_badges と badges の単純JOINのみで完結させる
 */

type Client = SupabaseClient<Database>

export type EarnedBadge = {
  code: string
  name: string
  awardedAt: string
}

/**
 * badges_select_all / user_badges_select_all はどちらも using (true) で全公開のため、
 * user_id を渡すだけで本人以外のセッション・匿名セッションからも正しく取れる
 *   docs/architecture/data-model/tables.md #user_badges #badges
 */
export async function getUserEarnedBadges(
  supabase: Client,
  userId: string,
): Promise<EarnedBadge[]> {
  const { data, error } = await supabase
    .from('user_badges')
    .select('awarded_at, badges (code, name)')
    .eq('user_id', userId)
    .order('awarded_at', { ascending: false })

  if (error) throw new Error(`バッジの取得に失敗しました: ${error.message}`)

  return (
    (data ?? []) as unknown as { awarded_at: string; badges: { code: string; name: string } }[]
  ).map((row) => ({
    code: row.badges.code,
    name: row.badges.name,
    awardedAt: row.awarded_at,
  }))
}
