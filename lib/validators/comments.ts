import { z } from 'zod'

// docs/architecture/data-model/tables.md #comments 本文サイズ上限
// posts の50,000字は投稿本文向けで、コメントには長すぎるため別途定める
export const COMMENT_BODY_MAX_CHARS = 500

// 空文字・上限超過チェックは createComment がアプリ層で行う（POST_BODY_EMPTY /
// POST_BODY_TOO_LONG を返し分けるため、ここでは min/max を課さない）
export const createCommentSchema = z.object({
  postId: z.string().uuid('投稿IDの形式が正しくありません'),
  // 返信は1階層まで（返信への返信は guard_comments_thread_integrity が拒否する）
  parentId: z.string().uuid('コメントIDの形式が正しくありません').optional(),
  body: z.string(),
  // true にできるかは RLS の WITH CHECK と guard_comments_official_owner トリガーが
  // 判定する（該当カフェの verified_owner_id 本人のみ）。ここでは値を素通しするだけで
  // 権限チェックはしない — CLAUDE.md「認可はRLSに委譲」
  isOfficial: z.boolean().optional().default(false),
})

export type CreateCommentInput = z.infer<typeof createCommentSchema>

export const deleteCommentSchema = z.object({
  commentId: z.string().uuid('コメントIDの形式が正しくありません'),
  postId: z.string().uuid('投稿IDの形式が正しくありません'),
})

export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>
