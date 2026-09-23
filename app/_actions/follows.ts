'use server'

import { checkAndAwardBadges } from '@/lib/badges/check'
import {
  POSTGRES_CHECK_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { createClient } from '@/lib/supabase/server'
import { followUserSchema } from '@/lib/validators/follows'
import type { Result } from '@/types/result'

/**
 * フォロー / フォロー解除。認可は follows_insert_own / follows_delete_own に委譲し、
 * ここでは入力の検証と、RLS に弾かれたときのエラーコード変換だけを行う
 *   supabase/migrations/20260916120000_guard_follows_insert_blocked_and_active_followee.sql
 */

// 自己フォローを弾く CHECK 制約。23514 を一律に自己フォロー扱いにすると、
// follows へ別の CHECK が増えた瞬間に無関係な違反が同じメッセージになる
const SELF_FOLLOW_CONSTRAINT = 'follows_no_self_follow'

type FollowUserError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'SELF_FOLLOW_FORBIDDEN'
  | 'ALREADY_FOLLOWING'
  | 'INTERNAL_ERROR'

type UnfollowUserError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

export async function followUser(input: unknown): Promise<Result<null, FollowUserError>> {
  const parsed = followUserSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // insert しっぱなしにせず select() で返り行を確かめる。RLS に弾かれたケースが
  // エラーではなく「0件の成功」として返る経路があり、握ると弾かれたのに成功扱いになる
  const { data, error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, followee_id: parsed.data.followeeId })
    .select('followee_id')
    .maybeSingle()

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION) return { ok: false, error: 'ALREADY_FOLLOWING' }
    // 自分のプロフィールにボタンは出ないので通常は届かない
    if (error.code === POSTGRES_CHECK_VIOLATION && error.message.includes(SELF_FOLLOW_CONSTRAINT)) {
      return { ok: false, error: 'SELF_FOLLOW_FORBIDDEN' }
    }
    // ブロック関係・相手が active でない・自分が suspended / pending_consent
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }

    console.error('[follows] フォローに失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  if (!data) return { ok: false, error: 'FORBIDDEN' }

  // COM_10_FOLLOWERS の判定。フォローされた側 (followeeId) に付与される
  await checkAndAwardBadges(supabase, parsed.data.followeeId, 'FOLLOW_RECEIVED')

  return { ok: true, data: null }
}

/**
 * フォロー解除。存在しない行の delete は 0件成功で返るが、そのまま成功にしてよい
 * （二重クリックや既に解除済みでも「フォローしていない」という結果は同じ）
 */
export async function unfollowUser(input: unknown): Promise<Result<null, UnfollowUserError>> {
  const parsed = followUserSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('followee_id', parsed.data.followeeId)

  if (error) {
    console.error('[follows] フォロー解除に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  return { ok: true, data: null }
}
