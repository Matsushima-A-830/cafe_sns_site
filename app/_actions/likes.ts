'use server'

import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { getPostLikeCount, publishedPostExists } from '@/lib/posts/post-detail'
import { createClient } from '@/lib/supabase/server'
import { type LikeEntryInput, likeEntrySchema } from '@/lib/validators/likes'
import type { Result } from '@/types/result'

/**
 * いいねの付け外し（S_HOME / S_EXPLORE / S_POST_DETAIL ほか投稿カードのある全画面）。
 * 認可は likes_insert_own / _delete_own に委譲し、ここでは入力の検証と
 * エラーコード変換だけを行う
 *   supabase/migrations/20260919120000_create_likes.sql
 *
 * glossary の `toggleLike()` は追加と解除に分けている（followUser / addCafeToList と同じ。
 * トグルにすると二重クリックで「どちらの状態を求めたのか」がサーバー側で決められない）。
 *
 * 成功時は確定した件数を返す。クライアントの楽観更新は ±1 しかできず、押した時点の
 * 表示が古いとズレが残り続ける（件数の state は props から1度しか初期化されない）
 */

// 23503 の出どころを見分けるための FK 名。user_id → profiles の違反と混ぜない
const POST_FK_CONSTRAINT = 'likes_post_id_fkey'

/** 付け外しの後の確定件数。クライアントはこれで楽観更新を上書きする */
export type LikeCount = { likeCount: number }

type LikeError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'POST_NOT_FOUND'
  | 'INTERNAL_ERROR'

type UnlikeError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

export async function likePost(input: unknown): Promise<Result<LikeCount, LikeError>> {
  const parsed = likeEntrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  // publishedPostExists / getPostLikeCount は失敗を例外にする。Server Actions の境界なので
  // ここで Result に畳む
  try {
    return await insertLike(parsed.data)
  } catch (cause) {
    console.error('[likes] いいねに失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

async function insertLike(input: LikeEntryInput): Promise<Result<LikeCount, LikeError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // FK は posts.status も deleted_at も見ない。これが無いと作者本人に限って
  // hidden な予約行・論理削除済みの投稿にもいいねが通る
  if (!(await publishedPostExists(supabase, input.postId))) {
    return { ok: false, error: 'POST_NOT_FOUND' }
  }

  // insert しっぱなしにせず select() で返り行を確かめる。RLS に弾かれたケースが
  // エラーではなく「0件の成功」として返る経路があり、握ると弾かれたのに成功扱いになる
  const { data, error } = await supabase
    .from('likes')
    .insert({ user_id: user.id, post_id: input.postId })
    .select('post_id')
    .maybeSingle()

  if (error) {
    // 主キー (user_id, post_id) の重複。求められた状態（いいね済み）は既に成立して
    // いるので成功として返す。ALREADY_LIKED を返すとクライアントは件数を直せない
    // （エラー側の Result は data を運べない）
    if (error.code === POSTGRES_UNIQUE_VIOLATION) {
      return { ok: true, data: { likeCount: await getPostLikeCount(supabase, input.postId) } }
    }
    if (error.code === POSTGRES_FOREIGN_KEY_VIOLATION) {
      // FK は post_id だけでなく user_id → profiles にもある。23503 を一律に
      // 「投稿が無い」と読むと、profiles 行がまだ無いユーザー（OTP確認後・
      // オンボーディング前）に「投稿が見つからない」と出てしまう
      return error.message.includes(POST_FK_CONSTRAINT)
        ? { ok: false, error: 'POST_NOT_FOUND' }
        : { ok: false, error: 'FORBIDDEN' }
    }
    // is_active_user() が偽（suspended / pending_consent）
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }

    console.error('[likes] いいねに失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  if (!data) return { ok: false, error: 'FORBIDDEN' }

  // revalidatePath は呼ばない: フィードも投稿詳細も auth.getUser() で cookie を読む
  // 動的レンダリングで、そもそもキャッシュに載っていない（pending-items D23）
  return { ok: true, data: { likeCount: await getPostLikeCount(supabase, input.postId) } }
}

/**
 * いいねを外す。存在しない行の delete は 0件成功で返るが、そのまま成功にしてよい
 * （二重クリックや既に解除済みでも「いいねしていない」という結果は同じ）
 */
export async function unlikePost(input: unknown): Promise<Result<LikeCount, UnlikeError>> {
  const parsed = likeEntrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  // likePost と同じく境界で握る。ここで例外を漏らすとクライアントの
  // startTransition 内で reject し、楽観更新の巻き戻しもエラー表示も走らない
  try {
    return await deleteLike(parsed.data)
  } catch (cause) {
    console.error('[likes] いいね解除に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

async function deleteLike(input: LikeEntryInput): Promise<Result<LikeCount, UnlikeError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // user_id は RLS が絞るが、明示しないと「自分の行だけ」という意図が読めない
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('user_id', user.id)
    .eq('post_id', input.postId)

  if (error) {
    console.error('[likes] いいね解除に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  return { ok: true, data: { likeCount: await getPostLikeCount(supabase, input.postId) } }
}
