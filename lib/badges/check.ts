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
 * 1件の付与失敗（RPCエラー）が他のバッジ判定・呼び出し元の本処理を巻き込まないよう、
 * 付与は1件ずつ try/catch で握って続行する（投稿公開自体はバッジ判定の成否に左右されるべきではない）
 */
export async function checkAndAwardBadges(
  supabase: Client,
  userId: string,
  trigger: BadgeTrigger,
): Promise<void> {
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
}
