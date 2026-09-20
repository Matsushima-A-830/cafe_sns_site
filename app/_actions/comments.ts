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

// トリガーの raise exception は SQLSTATE P0001 固定（guard_comments_official_owner /
// guard_comments_thread_integrity）。posts.ts と同じ理由でメッセージは 'FORBIDDEN' 固定
//   supabase/migrations/20260920120000_create_comments.sql
const RAISED_BY_TRIGGER = 'P0001'
// 23503 の出どころを見分けるための FK 名。author_id 側と混ぜない
const POST_FK_CONSTRAINT = 'comments_post_id_fkey'
const PARENT_FK_CONSTRAINT = 'comments_parent_id_fkey'

type CreateCommentError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'POST_NOT_FOUND'
  | 'COMMENT_NOT_FOUND'
  | 'POST_BODY_EMPTY'
  | 'POST_BODY_TOO_LONG'
  | 'INTERNAL_ERROR'

type DeleteCommentError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

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

  // NGワード検出はNGワード辞書が未整備のため今回のスコープでは実装しない
  // (pending-items.md B4 が未決。posts.ts createPost と同じ判断)
  const body = input.body.trim()
  if (body.length === 0) return { ok: false, error: 'POST_BODY_EMPTY' }
  if (body.length > COMMENT_BODY_MAX_CHARS) return { ok: false, error: 'POST_BODY_TOO_LONG' }

  // FK は posts.status も deleted_at も見ない。これが無いと作者本人に限って
  // hidden な予約行・論理削除済みの投稿にもコメントが通る（likes.ts と同じ理由）
  if (!(await publishedPostExists(supabase, input.postId))) {
    return { ok: false, error: 'POST_NOT_FOUND' }
  }

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
      if (error.message.includes(POST_FK_CONSTRAINT)) return { ok: false, error: 'POST_NOT_FOUND' }
      if (error.message.includes(PARENT_FK_CONSTRAINT)) {
        return { ok: false, error: 'COMMENT_NOT_FOUND' }
      }
      return { ok: false, error: 'FORBIDDEN' }
    }
    // is_active_user() が偽（suspended / pending_consent）、または is_official の
    // WITH CHECK（is_post_cafe_owner）に弾かれた
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    // guard_comments_official_owner（service_role 経由の is_official なりすまし）
    // guard_comments_thread_integrity（別投稿への返信・2階層目の返信・存在しない親）
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
 * 誤操作でもエラーにしない（本人以外には「削除できたか」を区別させない）
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
