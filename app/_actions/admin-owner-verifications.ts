'use server'

import { reportError } from '@/lib/monitoring/report-error'
import type { OwnerDocumentEntry } from '@/lib/owner/verification'
import { createOwnerDocumentViewUrl } from '@/lib/storage/owner-documents'
import { createClient } from '@/lib/supabase/server'
import { resolveOwnerVerificationSchema } from '@/lib/validators/admin-owner-verifications'
import type { Result } from '@/types/result'

/**
 * S_ADMIN_OWNER_REVIEW / 一覧。requireAdmin は他の admin Server Actions
 * （admin-reports.ts, admin-ng-words.ts）と同じ内容を複製する（このプロジェクトの方針。
 * 共通化しない）
 *   docs/design/screen-flow.md #6-カフェ経営者フロー
 *   docs/architecture/data-model/tables.md #cafe_owner_verifications
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
  if (profile?.role !== 'admin' || profile.status !== 'active') {
    return { ok: false, error: 'FORBIDDEN' }
  }

  return { ok: true, data: { id: user.id } }
}

export type OwnerVerificationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export type OwnerVerificationListItem = {
  id: string
  cafeId: string
  cafeName: string
  status: OwnerVerificationStatus
  createdAt: string
}

type ListOwnerVerificationsError = AdminGuardError

/** 一覧（S_ADMIN_OWNER_REVIEW一覧）。未処理を古い順に出す審査キューなので pending を既定にする */
export async function listOwnerVerifications(
  status: OwnerVerificationStatus = 'pending',
): Promise<Result<OwnerVerificationListItem[], ListOwnerVerificationsError>> {
  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { data, error } = await supabase
    .from('cafe_owner_verifications')
    .select('id, cafe_id, status, created_at, cafe:cafes(name)')
    .eq('status', status)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`オーナー認証申請一覧の取得に失敗しました: ${error.message}`)

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      cafeId: row.cafe_id,
      cafeName: row.cafe?.name ?? '(不明なカフェ)',
      status: row.status as OwnerVerificationStatus,
      createdAt: row.created_at,
    })),
  }
}

export type OwnerVerificationDocument = {
  type: string
  viewUrl: string | null
}

export type OwnerVerificationDetail = {
  id: string
  cafeId: string
  cafeName: string
  status: OwnerVerificationStatus
  contactEmail: string
  applicantNote: string | null
  reviewNotes: string | null
  createdAt: string
  reviewedAt: string | null
  applicant: { id: string; username: string; displayName: string }
  documents: OwnerVerificationDocument[]
}

type GetOwnerVerificationDetailError = AdminGuardError | 'NOT_FOUND'

export async function getOwnerVerificationDetail(
  verificationId: string,
): Promise<Result<OwnerVerificationDetail, GetOwnerVerificationDetailError>> {
  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { data, error } = await supabase
    .from('cafe_owner_verifications')
    .select(
      'id, cafe_id, status, document_urls, contact_email, applicant_note, review_notes, created_at, reviewed_at, cafe:cafes(name), applicant:profiles!cafe_owner_verifications_user_id_fkey (id, username, display_name)',
    )
    .eq('id', verificationId)
    .maybeSingle()

  if (error) throw new Error(`オーナー認証申請の取得に失敗しました: ${error.message}`)
  if (!data?.applicant) return { ok: false, error: 'NOT_FOUND' }

  const documentEntries = (data.document_urls ?? []) as OwnerDocumentEntry[]
  const documents = await Promise.all(
    documentEntries.map(async (entry) => {
      const signed = await createOwnerDocumentViewUrl(supabase, entry.path)
      return { type: entry.type, viewUrl: signed.ok ? signed.data : null }
    }),
  )

  return {
    ok: true,
    data: {
      id: data.id,
      cafeId: data.cafe_id,
      cafeName: data.cafe?.name ?? '(不明なカフェ)',
      status: data.status as OwnerVerificationStatus,
      contactEmail: data.contact_email,
      applicantNote: data.applicant_note,
      reviewNotes: data.review_notes,
      createdAt: data.created_at,
      reviewedAt: data.reviewed_at,
      applicant: {
        id: data.applicant.id,
        username: data.applicant.username,
        displayName: data.applicant.display_name,
      },
      documents,
    },
  }
}

type ResolveOwnerVerificationError =
  | AdminGuardError
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'VERIFICATION_ALREADY_RESOLVED'

/**
 * 判定の実行。resolveReport（admin-reports.ts）と同じ排他制御パターンを踏襲する:
 * cafe_owner_verifications の条件付き更新（status='pending' の間だけ）を cafes/profiles
 * への副作用より先に行い、その1本を「同時判定のどちらが勝つか」の排他制御に使う。
 * 更新0件なら他の admin が先に判定済みとみなして VERIFICATION_ALREADY_RESOLVED を返し、
 * 副作用（verified_owner_id 付与・role 昇格）を実行しない。
 * Supabase JS はクライアント側マルチステートメントトランザクションを持たないため、
 * cafe_owner_verifications 更新に勝った後の副作用・audit_logs・通知の失敗はロールバックされない
 *   docs/design/screen-flow.md #6-カフェ経営者フロー
 */
export async function resolveOwnerVerification(
  input: unknown,
): Promise<Result<{ verificationId: string }, ResolveOwnerVerificationError>> {
  const parsed = resolveOwnerVerificationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { verificationId, decision, reviewNotes } = parsed.data

  const { data: verification, error: fetchError } = await supabase
    .from('cafe_owner_verifications')
    .select('id, cafe_id, user_id, status')
    .eq('id', verificationId)
    .maybeSingle()
  if (fetchError) throw new Error(`オーナー認証申請の取得に失敗しました: ${fetchError.message}`)
  if (!verification) return { ok: false, error: 'NOT_FOUND' }
  // reports の SELF_REPORT_FORBIDDEN と同じ理由。申請者本人が admin を兼ねる場合に
  // 自分の申請を自分で承認できてしまうと、第三者審査という前提が崩れる
  if (verification.user_id === guard.data.id) return { ok: false, error: 'FORBIDDEN' }

  const newStatus: OwnerVerificationStatus = decision === 'approve' ? 'approved' : 'rejected'
  const { data: updated, error: updateError } = await supabase
    .from('cafe_owner_verifications')
    .update({
      status: newStatus,
      reviewed_by: guard.data.id,
      review_notes: reviewNotes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', verificationId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (updateError) throw new Error(`オーナー認証申請の更新に失敗しました: ${updateError.message}`)
  // 0件 = 他の admin が同時に判定済み（このSELECTとUPDATEの間で status が変わった）
  if (!updated) return { ok: false, error: 'VERIFICATION_ALREADY_RESOLVED' }

  if (decision === 'approve') {
    const { error: cafeError } = await supabase
      .from('cafes')
      .update({ verified_owner_id: verification.user_id })
      .eq('id', verification.cafe_id)
    if (cafeError) throw new Error(`カフェの認証オーナー設定に失敗しました: ${cafeError.message}`)

    // role='admin' の行は昇格対象から除外する。admin 兼オーナーの申請を承認しても
    // role を 'owner' に上書きして admin 権限を剥奪してしまわないため（0件マッチで無害に終わる）
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role: 'owner' })
      .eq('id', verification.user_id)
      .neq('role', 'admin')
    if (profileError)
      throw new Error(`プロフィールのロール更新に失敗しました: ${profileError.message}`)
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    actor_id: guard.data.id,
    action: decision === 'approve' ? 'approve_owner_verification' : 'reject_owner_verification',
    target_type: 'cafe_owner_verification',
    target_id: verificationId,
    metadata: { cafeId: verification.cafe_id },
  })
  if (auditError) reportError('admin-owner-verifications', 'audit_logs の記録に失敗', auditError)

  const { error: notifyError } = await supabase.from('notifications').insert({
    recipient_id: verification.user_id,
    type: decision === 'approve' ? 'owner_verified' : 'owner_verification_rejected',
    entity_type: 'cafe',
    entity_id: verification.cafe_id,
  })
  if (notifyError) reportError('admin-owner-verifications', '申請者への通知に失敗', notifyError)

  return { ok: true, data: { verificationId } }
}
