'use server'

import { getCafeDetail } from '@/lib/cafes/cafe-detail'
import {
  POSTGRES_CHECK_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { getCommentById } from '@/lib/posts/comments'
import { getPostDetail } from '@/lib/posts/post-detail'
import { getProfileById } from '@/lib/profiles/public-profile'
import { createClient } from '@/lib/supabase/server'
import { createReportSchema } from '@/lib/validators/reports'
import type { Result } from '@/types/result'

/**
 * 通報。target_id はポリモーフィック（post/comment/user/cafe）で FK が無いため、
 * INSERT 前に対象種別ごとの取得関数で存在確認する。存在しなければ NOT_FOUND
 * （他人に存在の有無を教えない、既存の詳細ページと同じ扱い）
 *   docs/architecture/data-model/tables.md #reports
 *   supabase/migrations/20260921000000_create_reports.sql
 */

const SELF_REPORT_CONSTRAINT = 'reports_no_self_report'

type CreateReportError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'SELF_REPORT_FORBIDDEN'
  | 'REPORT_ALREADY_SUBMITTED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'

/** 完了画面の「ブロックしますか？」導線が誰をブロック対象にするか。cafe には該当ユーザーが無い */
type CreateReportResult = { blockableUserId: string | null }

export async function createReport(
  input: unknown,
): Promise<Result<CreateReportResult, CreateReportError>> {
  const parsed = createReportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { targetType, targetId, reason, description } = parsed.data

  const resolved = await resolveBlockableUserId(supabase, targetType, targetId)
  if (resolved === NOT_FOUND) return { ok: false, error: 'NOT_FOUND' }
  // 自分の投稿/コメントを自分で通報したケース。self-block は blocks 側で弾かれるため、
  // 完了画面にブロック提案を出さない（DBの自己通報チェックは target_type='user' のみ、D47）
  const blockableUserId = resolved === user.id ? null : resolved

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    target_type: targetType,
    target_id: targetId,
    reason,
    description: description || null,
  })

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION)
      return { ok: false, error: 'REPORT_ALREADY_SUBMITTED' }
    if (error.code === POSTGRES_CHECK_VIOLATION && error.message.includes(SELF_REPORT_CONSTRAINT)) {
      return { ok: false, error: 'SELF_REPORT_FORBIDDEN' }
    }
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }

    console.error('[reports] 通報に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  return { ok: true, data: { blockableUserId } }
}

const NOT_FOUND = Symbol('report-target-not-found')

/**
 * 対象の実在確認と同時に、ブロック対象ユーザーを求める。target_type によって
 * 「誰をブロックするか」が違う（post/comment は投稿者/コメント作者、cafe は
 * verified_owner_id を公開する取得関数が無いため現状 null。pending-items 起票）
 */
async function resolveBlockableUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetType: 'post' | 'comment' | 'user' | 'cafe',
  targetId: string,
): Promise<string | null | typeof NOT_FOUND> {
  switch (targetType) {
    case 'user': {
      const profile = await getProfileById(supabase, targetId)
      return profile ? profile.id : NOT_FOUND
    }
    case 'post': {
      const post = await getPostDetail(supabase, targetId)
      return post ? post.author.id : NOT_FOUND
    }
    case 'comment': {
      const comment = await getCommentById(supabase, targetId)
      return comment ? comment.authorId : NOT_FOUND
    }
    case 'cafe': {
      const cafe = await getCafeDetail(supabase, targetId)
      return cafe ? null : NOT_FOUND
    }
  }
}
