'use server'

import { getReportTargetSummary, type ReportTargetSummary } from '@/lib/admin/report-target'
import { createClient } from '@/lib/supabase/server'
import { resolveReportSchema } from '@/lib/validators/admin-reports'
import type { Result } from '@/types/result'

/**
 * S_ADMIN_REPORTS / S_ADMIN_REVIEW。middleware が /admin を role='admin' 以外へ
 * /not-found へ rewrite 済みだが、Server Action は URL を経由せず直接呼べるため
 * ここでも role を確認する（多層防御。RLS も admin 以外には空/自分の行しか返さない）
 *   docs/architecture/routing.md middleware.ts
 *   docs/design/screen-flow.md #5-通報ブロックフロー
 */

type AdminGuardError = 'UNAUTHENTICATED' | 'FORBIDDEN'
type Client = Awaited<ReturnType<typeof createClient>>

async function requireAdmin(supabase: Client): Promise<Result<{ id: string }, AdminGuardError>> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error(`権限確認に失敗しました: ${error.message}`)
  // RLS の is_admin() と同じ条件（role='admin' かつ status='active'）に揃える。
  // role だけ見ると、停止済み admin が「更新は0件通っただけ」で ok:true を返しかねない
  if (profile?.role !== 'admin' || profile.status !== 'active') {
    return { ok: false, error: 'FORBIDDEN' }
  }

  return { ok: true, data: { id: user.id } }
}

export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'rejected'

export type ReportListItem = {
  id: string
  targetType: 'post' | 'comment' | 'user' | 'cafe'
  reason: string
  status: ReportStatus
  createdAt: string
}

type ListReportsError = AdminGuardError | 'INVALID_INPUT'

/** 一覧（S_ADMIN_REPORTS）。未処理を古い順に出す通報キューなので pending/reviewing を既定にする */
export async function listReports(
  status: ReportStatus = 'pending',
): Promise<Result<ReportListItem[], ListReportsError>> {
  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { data, error } = await supabase
    .from('reports')
    .select('id, target_type, reason, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`通報一覧の取得に失敗しました: ${error.message}`)

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      targetType: row.target_type as ReportListItem['targetType'],
      reason: row.reason,
      status: row.status as ReportStatus,
      createdAt: row.created_at,
    })),
  }
}

export type ReportDetail = {
  id: string
  targetType: 'post' | 'comment' | 'user' | 'cafe'
  targetId: string
  reason: string
  description: string | null
  status: ReportStatus
  createdAt: string
  reporter: { id: string; username: string; displayName: string }
  target: ReportTargetSummary | null
}

type GetReportDetailError = AdminGuardError | 'NOT_FOUND'

export async function getReportDetail(
  reportId: string,
): Promise<Result<ReportDetail, GetReportDetailError>> {
  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { data, error } = await supabase
    .from('reports')
    .select(
      'id, target_type, target_id, reason, description, status, created_at, reporter:profiles!reports_reporter_id_fkey (id, username, display_name)',
    )
    .eq('id', reportId)
    .maybeSingle()

  if (error) throw new Error(`通報詳細の取得に失敗しました: ${error.message}`)
  if (!data?.reporter) return { ok: false, error: 'NOT_FOUND' }

  const target = await getReportTargetSummary(
    supabase,
    data.target_type as ReportDetail['targetType'],
    data.target_id,
  )

  return {
    ok: true,
    data: {
      id: data.id,
      targetType: data.target_type as ReportDetail['targetType'],
      targetId: data.target_id,
      reason: data.reason,
      description: data.description,
      status: data.status as ReportStatus,
      createdAt: data.created_at,
      reporter: {
        id: data.reporter.id,
        username: data.reporter.username,
        displayName: data.reporter.display_name,
      },
      target,
    },
  }
}

type ResolveReportError =
  | AdminGuardError
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'REPORT_ALREADY_RESOLVED'
  | 'INTERNAL_ERROR'

const DECISION_TO_TARGET_TYPE: Record<
  'hide_post' | 'delete_comment' | 'suspend_user',
  ReportDetail['targetType']
> = {
  hide_post: 'post',
  delete_comment: 'comment',
  suspend_user: 'user',
}

/**
 * 判定の実行。reports の条件付き更新（status が pending/reviewing の間だけ）を
 * 対象への副作用より先に行い、その1本を「同時判定のどちらが勝つか」の排他制御に使う。
 * 更新0件なら他の admin が先に判定済みとみなして REPORT_ALREADY_RESOLVED を返し、
 * 副作用（非表示化・削除・停止）を実行しない。
 * Supabase JS はクライアント側マルチステートメントトランザクションを持たないため、
 * reports 更新に勝った後の副作用・audit_logs・通知の失敗はロールバックされない
 *   docs/design/screen-flow.md #5-通報ブロックフロー
 */
export async function resolveReport(
  input: unknown,
): Promise<Result<{ reportId: string }, ResolveReportError>> {
  const parsed = resolveReportSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { reportId, decision, resolutionNotes } = parsed.data

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('id, target_type, target_id, reporter_id, status')
    .eq('id', reportId)
    .maybeSingle()
  if (reportError) throw new Error(`通報の取得に失敗しました: ${reportError.message}`)
  if (!report) return { ok: false, error: 'NOT_FOUND' }
  if (decision !== 'reject' && DECISION_TO_TARGET_TYPE[decision] !== report.target_type) {
    return { ok: false, error: 'INVALID_INPUT' }
  }

  const newStatus: ReportStatus = decision === 'reject' ? 'rejected' : 'resolved'
  const { data: updatedReport, error: updateError } = await supabase
    .from('reports')
    .update({
      status: newStatus,
      reviewer_id: guard.data.id,
      resolution_notes: resolutionNotes || null,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .in('status', ['pending', 'reviewing'])
    .select('id')
    .maybeSingle()
  if (updateError) throw new Error(`通報の更新に失敗しました: ${updateError.message}`)
  // 0件 = 他の admin が同時に判定済み（このSELECTとUPDATEの間で status が変わった）
  if (!updatedReport) return { ok: false, error: 'REPORT_ALREADY_RESOLVED' }

  if (decision === 'hide_post') {
    const { error } = await supabase
      .from('posts')
      .update({ status: 'hidden' })
      .eq('id', report.target_id)
    if (error) throw new Error(`投稿の非表示化に失敗しました: ${error.message}`)
  } else if (decision === 'delete_comment') {
    const { error } = await supabase
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', report.target_id)
    if (error) throw new Error(`コメントの削除に失敗しました: ${error.message}`)
  } else if (decision === 'suspend_user') {
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', report.target_id)
    if (error) throw new Error(`ユーザーの停止に失敗しました: ${error.message}`)
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    actor_id: guard.data.id,
    action: decision,
    target_type: report.target_type,
    target_id: report.target_id,
    metadata: { reportId },
  })
  if (auditError) console.error('[admin-reports] audit_logs の記録に失敗:', auditError)

  const { error: notifyError } = await supabase.from('notifications').insert({
    recipient_id: report.reporter_id,
    type: 'report_resolved',
    entity_type: 'report',
    entity_id: reportId,
  })
  if (notifyError) console.error('[admin-reports] 通報者への通知に失敗:', notifyError)

  return { ok: true, data: { reportId } }
}
