'use server'

import { checkAndAwardBadges } from '@/lib/badges/check'
import {
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { reportError } from '@/lib/monitoring/report-error'
import { createClient } from '@/lib/supabase/server'
import {
  awardRegularSchema,
  revokeRegularSchema,
  updateRegularNoteSchema,
} from '@/lib/validators/regular-customers'
import type { Result } from '@/types/result'

/**
 * S_OWNER_REGULARS の3操作。認可は regular_customers の RLS
 * （regular_customers_insert_owner / _update_owner, is_cafe_owner）に委譲する
 *   supabase/migrations/20260923010000_create_regular_customers.sql
 */

type AwardRegularError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'ALREADY_REGULAR'
  | 'INTERNAL_ERROR'

/** 認定モーダルの[認定する]。awarded_by は必ずセッションから引く（なりすまし防止） */
export async function awardRegular(input: unknown): Promise<Result<null, AwardRegularError>> {
  const parsed = awardRegularSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('regular_customers')
    .insert({
      cafe_id: parsed.data.cafeId,
      user_id: parsed.data.userId,
      awarded_by: user.id,
      note: parsed.data.note || null,
    })
    .select('user_id')
    .maybeSingle()

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION) {
      // 主キー (user_id, cafe_id) の重複。get_regular_candidates は取消済み
      // （revoked_at が非NULL）のユーザーを候補から除外しないため、認定候補タブに
      // 出てくる=再認定できる、という見た目と矛盾させないよう再認定として扱う
      return reAwardRevokedRegular(supabase, parsed.data, user.id)
    }
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    reportError('regular-customers', '常連認定に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  if (!data) return { ok: false, error: 'FORBIDDEN' }

  // REGULAR_* バッジの判定（docs/seed/badges-initial-set.md #判定タイミング）。
  // 呼び出しセッションはオーナー、バッジは認定された顧客(parsed.data.userId)側に付与される
  await checkAndAwardBadges(supabase, parsed.data.userId, 'REGULAR_AWARDED')

  return { ok: true, data: null }
}

type Client = Awaited<ReturnType<typeof createClient>>

/**
 * 取消済み(revoked_at IS NOT NULL)の行だけを対象に再認定する。既に有効な常連
 * （revoked_at IS NULL）であれば対象行が無いため ALREADY_REGULAR を返す
 */
async function reAwardRevokedRegular(
  supabase: Client,
  input: { cafeId: string; userId: string; note?: string },
  awardedById: string,
): Promise<Result<null, AwardRegularError>> {
  const { data, error } = await supabase
    .from('regular_customers')
    .update({
      awarded_by: awardedById,
      note: input.note || null,
      awarded_at: new Date().toISOString(),
      revoked_at: null,
    })
    .eq('cafe_id', input.cafeId)
    .eq('user_id', input.userId)
    .not('revoked_at', 'is', null)
    .select('user_id')
    .maybeSingle()

  if (error) {
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    reportError('regular-customers', '再認定に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  if (!data) return { ok: false, error: 'ALREADY_REGULAR' }

  await checkAndAwardBadges(supabase, input.userId, 'REGULAR_AWARDED')

  return { ok: true, data: null }
}

type RevokeRegularError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INTERNAL_ERROR'

/** 取消モーダルの[取消する]。revoked_at を立てるだけで行は残す（履歴保持） */
export async function revokeRegular(input: unknown): Promise<Result<null, RevokeRegularError>> {
  const parsed = revokeRegularSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('regular_customers')
    .update({ revoked_at: new Date().toISOString() })
    .eq('cafe_id', parsed.data.cafeId)
    .eq('user_id', parsed.data.userId)
    .select('user_id')
    .maybeSingle()

  if (error) {
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    reportError('regular-customers', '常連取消に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  // 対象行が無い（存在しない組み合わせ）・オーナーでない、のどちらも見分けが付かない
  // （RLSに認可を委譲する方針上、区別するための専用コードは持たない）
  if (!data) return { ok: false, error: 'FORBIDDEN' }

  return { ok: true, data: null }
}

type UpdateRegularNoteError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INTERNAL_ERROR'

/** 常連タブの[メモ編集] */
export async function updateRegularNote(
  input: unknown,
): Promise<Result<null, UpdateRegularNoteError>> {
  const parsed = updateRegularNoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('regular_customers')
    .update({ note: parsed.data.note || null })
    .eq('cafe_id', parsed.data.cafeId)
    .eq('user_id', parsed.data.userId)
    .select('user_id')
    .maybeSingle()

  if (error) {
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    reportError('regular-customers', 'メモ更新に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  if (!data) return { ok: false, error: 'FORBIDDEN' }

  return { ok: true, data: null }
}
