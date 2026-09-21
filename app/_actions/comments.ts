'use server'

import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
} from '@/lib/constants/postgres-error-codes'
import { type CommentListPage, getPostCommentCount, getPostComments } from '@/lib/posts/comments'
import { publishedPostExists } from '@/lib/posts/post-detail'
import { createClient } from '@/lib/supabase/server'
import {
  COMMENT_BODY_MAX_CHARS,
  type CreateCommentInput,
  createCommentSchema,
  type DeleteCommentInput,
  deleteCommentSchema,
  loadMoreCommentsSchema,
} from '@/lib/validators/comments'
import type { Result } from '@/types/result'

/**
 * コメントの作成・論理削除（S_POST_DETAIL）。認可は comments_insert_own /
 * comments_update_moderation に委譲し、ここでは入力の検証とエラーコード変換だけを行う
 *   supabase/migrations/20260920120000_create_comments.sql
 */

// トリガーの raise exception は SQLSTATE P0001 固定。コード自体がメッセージ文字列
// （FORBIDDEN, COMMENT_NOT_FOUND, COMMENT_HAS_REPLIES）になる
//   supabase/migrations/20260920120000_create_comments.sql
const RAISED_BY_TRIGGER = 'P0001'
// 23503 の出どころを見分けるための FK 名。author_id 側と混ぜない
const POST_FK_CONSTRAINT = 'comments_post_id_fkey'

function isRaisedWithMarker(error: { code?: string | null; message: string }, marker: string) {
  return error.code === RAISED_BY_TRIGGER && error.message.includes(marker)
}

type CreateCommentError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'POST_NOT_FOUND'
  | 'COMMENT_NOT_FOUND'
  | 'POST_BODY_EMPTY'
  | 'POST_BODY_TOO_LONG'
  | 'NG_WORD_DETECTED'
  | 'INTERNAL_ERROR'

type DeleteCommentError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'COMMENT_HAS_REPLIES'
  | 'INTERNAL_ERROR'

export type CreateCommentResult = { commentId: string; commentCount: number }
export type CommentCount = { commentCount: number }

export async function createComment(
  input: unknown,
): Promise<Result<CreateCommentResult, CreateCommentError>> {
  const parsed = createCommentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  // publishedPostExists / getPostCommentCount は失敗を例外にする。Server Actions の
  // 境界なのでここで Result に畳む
  try {
    return await insertComment(parsed.data)
  } catch (cause) {
    console.error('[comments] コメントの投稿に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

async function insertComment(
  input: CreateCommentInput,
): Promise<Result<CreateCommentResult, CreateCommentError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const body = input.body.trim()
  if (body.length === 0) return { ok: false, error: 'POST_BODY_EMPTY' }
  if (body.length > COMMENT_BODY_MAX_CHARS) return { ok: false, error: 'POST_BODY_TOO_LONG' }

  // FK は posts.status も deleted_at も見ない。これが無いと作者本人に限って
  // hidden な予約行・論理削除済みの投稿にもコメントが通る（likes.ts と同じ理由）。
  // NGワード判定より先に見る: 存在しない投稿への書き込みは POST_NOT_FOUND を
  // 優先させ、無駄な RPC 呼び出しも避ける
  if (!(await publishedPostExists(supabase, input.postId))) {
    return { ok: false, error: 'POST_NOT_FOUND' }
  }

  // check_ng_words は posts.ts createPost と同じ関数。severity=block のみ判定対象
  //   supabase/migrations/20260921040000_create_ng_words.sql
  const { data: ngWord, error: ngWordError } = await supabase.rpc('check_ng_words', {
    p_text: body,
  })
  if (ngWordError) throw new Error(`NGワードチェックに失敗しました: ${ngWordError.message}`)
  if (ngWord) return { ok: false, error: 'NG_WORD_DETECTED' }

  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: input.postId,
      author_id: user.id,
      parent_id: input.parentId ?? null,
      body,
      is_official: input.isOfficial,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === POSTGRES_FOREIGN_KEY_VIOLATION) {
      // parent_id の FK 違反はここには来ない: 23503 の制約チェックより先に
      // guard_comments_thread_integrity（BEFORE トリガー）が発火し、存在しない/
      // 削除済みの parent_id は P0001 の COMMENT_NOT_FOUND として先に弾かれる
      if (error.message.includes(POST_FK_CONSTRAINT)) return { ok: false, error: 'POST_NOT_FOUND' }
      return { ok: false, error: 'FORBIDDEN' }
    }
    // is_active_user() が偽（suspended / pending_consent）、または is_official の
    // WITH CHECK（is_post_cafe_owner）に弾かれた
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    // guard_comments_thread_integrity: 存在しない/削除済みの parent_id
    if (isRaisedWithMarker(error, 'COMMENT_NOT_FOUND'))
      return { ok: false, error: 'COMMENT_NOT_FOUND' }
    // guard_comments_official_owner（service_role 経由の is_official なりすまし）
    // guard_comments_thread_integrity（別投稿への返信・2階層目の返信）
    if (error.code === RAISED_BY_TRIGGER) return { ok: false, error: 'FORBIDDEN' }

    console.error('[comments] コメントの投稿に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  if (!data) return { ok: false, error: 'FORBIDDEN' }

  return {
    ok: true,
    data: { commentId: data.id, commentCount: await getPostCommentCount(supabase, input.postId) },
  }
}

/**
 * コメントの論理削除。作者本人 or 投稿主（モデレーション）のどちらでも呼べる
 * （comments_update_moderation）。対象外の行は RLS の using が偽になり 0件更新の
 * まま成功で返る — likes.ts unlikePost と同じ理由で、二重クリックや対象外への
 * 誤操作でもエラーにしない（本人以外には「削除できたか」を区別させない）。
 *
 * 返信付きのトップレベルコメントは、投稿主でない作者本人には削除させない
 * （guard_comments_moderation_columns が COMMENT_HAS_REPLIES を投げる）。
 * 他人が書いた返信を、コメントの作者というだけの権限で消せてしまうのを防ぐため。
 * 投稿主が削除する場合は cascade_delete_comment_replies が返信ごと連動して消す
 *   supabase/migrations/20260920120000_create_comments.sql
 */
export async function deleteComment(
  input: unknown,
): Promise<Result<CommentCount, DeleteCommentError>> {
  const parsed = deleteCommentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  try {
    return await softDeleteComment(parsed.data)
  } catch (cause) {
    console.error('[comments] コメントの削除に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}

async function softDeleteComment(
  input: DeleteCommentInput,
): Promise<Result<CommentCount, DeleteCommentError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', input.commentId)
    .eq('post_id', input.postId)
    .is('deleted_at', null)

  if (error) {
    if (isRaisedWithMarker(error, 'COMMENT_HAS_REPLIES')) {
      return { ok: false, error: 'COMMENT_HAS_REPLIES' }
    }
    console.error('[comments] コメントの削除に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  return { ok: true, data: { commentCount: await getPostCommentCount(supabase, input.postId) } }
}

type LoadMoreCommentsError = 'INVALID_INPUT' | 'INTERNAL_ERROR'

/**
 * 「もっと見る」の次ページ取得。読み取りだが、Route Handler を足さずに済むので
 * Server Action にする（app/_actions/feed.ts loadMoreFeed と同じ判断）
 */
export async function loadMoreComments(
  input: unknown,
): Promise<Result<CommentListPage, LoadMoreCommentsError>> {
  const parsed = loadMoreCommentsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  try {
    const page = await getPostComments(supabase, parsed.data.postId, { cursor: parsed.data.cursor })
    return { ok: true, data: page }
  } catch (cause) {
    console.error('[comments] 次ページの取得に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}
