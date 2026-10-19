'use server'

import {
  POSTGRES_CHECK_VIOLATION,
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { reportError } from '@/lib/monitoring/report-error'
import { createClient } from '@/lib/supabase/server'
import { claimCafeSchema, withdrawClaimSchema } from '@/lib/validators/owner'
import type { Result } from '@/types/result'

/**
 * オーナー認証申請（S_OWNER_CLAIM）・取り下げ（S_OWNER_PENDING）。
 *   docs/architecture/data-model/tables.md #cafe_owner_verifications
 *   supabase/migrations/20260921060000_create_cafe_owner_verifications.sql
 */

// トリガー guard_cafe_owner_verifications_cafe_claimed の raise exception は
// SQLSTATE P0001 固定で、コード自体がメッセージ文字列になる（posts.ts と同じ形）
const RAISED_BY_TRIGGER = 'P0001'
const VERIFICATIONS_CAFE_ID_FKEY = 'cafe_owner_verifications_cafe_id_fkey'

type ClaimCafeError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'CAFE_NOT_FOUND'
  | 'CAFE_ALREADY_CLAIMED'
  | 'DOCUMENTS_INSUFFICIENT'
  | 'VERIFICATION_ALREADY_PENDING'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'

type WithdrawClaimError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'

type PostgrestLikeError = { code?: string | null; message: string } | null

function isRaisedWithMarker(error: PostgrestLikeError, marker: string): boolean {
  return error?.code === RAISED_BY_TRIGGER && error.message.includes(marker)
}

export async function claimCafe(
  input: unknown,
): Promise<Result<{ verificationId: string }, ClaimCafeError>> {
  const parsed = claimCafeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { cafeId, documents, contactEmail, applicantNote } = parsed.data

  const { data, error } = await supabase
    .from('cafe_owner_verifications')
    .insert({
      user_id: user.id,
      cafe_id: cafeId,
      document_urls: documents,
      contact_email: contactEmail,
      applicant_note: applicantNote || null,
    })
    .select('id')
    .single()

  if (error) {
    if (isRaisedWithMarker(error, 'CAFE_ALREADY_CLAIMED')) {
      return { ok: false, error: 'CAFE_ALREADY_CLAIMED' }
    }
    if (error.code === POSTGRES_UNIQUE_VIOLATION)
      return { ok: false, error: 'VERIFICATION_ALREADY_PENDING' }
    if (error.code === POSTGRES_CHECK_VIOLATION)
      return { ok: false, error: 'DOCUMENTS_INSUFFICIENT' }
    if (
      error.code === POSTGRES_FOREIGN_KEY_VIOLATION &&
      error.message.includes(VERIFICATIONS_CAFE_ID_FKEY)
    ) {
      return { ok: false, error: 'CAFE_NOT_FOUND' }
    }
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }

    reportError('owner', 'claimCafe に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  return { ok: true, data: { verificationId: data.id } }
}

/**
 * status='pending' → 'withdrawn' のみ許可。対象外の行（他人の申請・pending以外）は
 * NOT_FOUND として扱う（reports の resolveReport と同じ「見せない」方針。詳細を教えない）。
 *
 * .eq('user_id', user.id) は RLS だけに任せない。cafe_owner_verifications_update_admin は
 * 「admin なら任意の行を UPDATE してよい」という審査用の広いポリシーで、user_id での
 * 絞り込みを持たない。withdrawClaim は自己サービス用の取り下げ操作なので、admin が
 * 誤って（またはverificationIdを知った第三者経由で）他人の申請を取り下げてしまう経路を
 * ここで閉じる
 */
export async function withdrawClaim(input: unknown): Promise<Result<null, WithdrawClaimError>> {
  const parsed = withdrawClaimSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('cafe_owner_verifications')
    .update({ status: 'withdrawn' })
    .eq('id', parsed.data.verificationId)
    .eq('user_id', user.id)
    .select('id')

  if (error) {
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    reportError('owner', 'withdrawClaim に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  if (!data || data.length === 0) return { ok: false, error: 'NOT_FOUND' }

  return { ok: true, data: null }
}
