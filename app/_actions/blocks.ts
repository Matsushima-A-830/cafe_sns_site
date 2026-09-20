'use server'

import {
  POSTGRES_CHECK_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { createClient } from '@/lib/supabase/server'
import { blockUserSchema } from '@/lib/validators/blocks'
import type { Result } from '@/types/result'

/**
 * ブロック / ブロック解除。認可は blocks_insert_own / blocks_delete_own に委譲し、
 * ここでは入力の検証と、RLS・CHECK に弾かれたときのエラーコード変換だけを行う
 *   supabase/migrations/20260905130300_create_follows_and_blocks.sql
 */

const SELF_BLOCK_CONSTRAINT = 'blocks_no_self_block'

type BlockUserError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'BLOCK_SELF_FORBIDDEN'
  | 'INTERNAL_ERROR'

type UnblockUserError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

export async function blockUser(input: unknown): Promise<Result<null, BlockUserError>> {
  const parsed = blockUserSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // insert しっぱなしにせず select() で返り行を確かめる。follows.ts と同じ理由 —
  // RLS に弾かれたケースがエラーではなく「0件の成功」として返る経路がある
  const { data, error } = await supabase
    .from('blocks')
    .insert({ blocker_id: user.id, blocked_id: parsed.data.targetUserId })
    .select('blocked_id')
    .maybeSingle()

  if (error) {
    // 主キー (blocker_id, blocked_id) の重複。求められた状態（ブロック済み）は
    // 既に成立しているので成功として返す
    if (error.code === POSTGRES_UNIQUE_VIOLATION) return { ok: true, data: null }
    if (error.code === POSTGRES_CHECK_VIOLATION && error.message.includes(SELF_BLOCK_CONSTRAINT)) {
      return { ok: false, error: 'BLOCK_SELF_FORBIDDEN' }
    }
    // blocks_insert_own は auth.uid() = blocker_id のみで、suspended / pending_consent でも
    // 意図的に許可している（被害者保護。D13）ため現状は到達しないが、follows.ts 等
    // 他の Server Actions と同じ変換を揃えておく
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }

    console.error('[blocks] ブロックに失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  if (!data) return { ok: false, error: 'FORBIDDEN' }
  return { ok: true, data: null }
}

/**
 * ブロック解除。存在しない行の delete は 0件成功で返るが、そのまま成功にしてよい
 * （二重クリックや既に解除済みでも「ブロックしていない」という結果は同じ）
 */
export async function unblockUser(input: unknown): Promise<Result<null, UnblockUserError>> {
  const parsed = blockUserSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', parsed.data.targetUserId)

  if (error) {
    console.error('[blocks] ブロック解除に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  return { ok: true, data: null }
}

export type BlockedUser = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

type ListBlockedUsersError = 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

/**
 * 自分がブロックした一覧（S_BLOCKED_USERS）。blocks_select_own が
 * 「ブロックした本人にしか見せない」を担保するので、ここでは絞り込みを重ねない
 */
export async function listBlockedUsers(): Promise<Result<BlockedUser[], ListBlockedUsersError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('blocks')
    .select('blocked:profiles!blocks_blocked_id_fkey (id, username, display_name, avatar_url)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[blocks] ブロック一覧の取得に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  return {
    ok: true,
    data: data
      .map((row) => row.blocked)
      .filter((profile): profile is NonNullable<typeof profile> => profile != null)
      .map((profile) => ({
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
      })),
  }
}
