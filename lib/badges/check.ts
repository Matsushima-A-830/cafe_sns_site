import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeCriteria, BadgeTrigger } from '@/types/badges'
import type { Database } from '@/types/database'
import { evaluateCriteria, TRIGGER_CRITERIA_TYPES } from './rules'

type Client = SupabaseClient<Database>

/**
 * トリガー種別に応じたバッジ候補だけを評価し、条件を満たしたバッジを award_badge RPC で確定する。
 * 判定は Server Actions から呼ぶ（DBトリガーには置かない。
 * docs/architecture/data-model/README.md #バッジ付与ロジックの設計）。
 *
 * 呼び出し元（投稿公開・常連認定・いいね・フォロー）の本処理はバッジ判定の成否に
 * 左右されるべきではないため、関数全体を try/catch で握る。個々の RPC エラーだけでなく、
 * badges/user_badges の読み取りや evaluateCriteria が想定外の例外を投げた場合も
 * ここで吸収し、呼び出し元へは伝播させない
 */
export async function checkAndAwardBadges(
  supabase: Client,
  userId: string,
  trigger: BadgeTrigger,
): Promise<void> {
  try {
    const relevantTypes = TRIGGER_CRITERIA_TYPES[trigger]

    const { data: badges } = await supabase.from('badges').select('id, code, criteria')
    const candidates = (badges ?? []).filter((b) =>
      relevantTypes.includes((b.criteria as BadgeCriteria).type),
    )
    if (candidates.length === 0) return

    const { data: awarded } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', userId)
    const awardedIds = new Set((awarded ?? []).map((r) => r.badge_id))
    const unearned = candidates.filter((b) => !awardedIds.has(b.id))
    if (unearned.length === 0) return

    const earned = await Promise.all(
      unearned.map((b) => evaluateCriteria(supabase, userId, b.criteria as BadgeCriteria)),
    )

    for (const [index, badge] of unearned.entries()) {
      if (!earned[index]) continue
      const { error } = await supabase.rpc('award_badge', {
        p_user_id: userId,
        p_badge_code: badge.code,
      })
      if (error) {
        console.error(`バッジ付与に失敗: ${badge.code}`, error)
      }
    }
  } catch (cause) {
    console.error(`バッジ判定に失敗 (trigger=${trigger})`, cause)
  }
}
