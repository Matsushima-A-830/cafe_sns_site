'use server'

import { revalidatePath } from 'next/cache'
import { type CongestionSummary, getCafeCongestion } from '@/lib/cafes/congestion'
import {
  POSTGRES_FOREIGN_KEY_VIOLATION,
  POSTGRES_INSUFFICIENT_PRIVILEGE,
} from '@/lib/constants/postgres-error-codes'
import { createClient } from '@/lib/supabase/server'
import { reportCongestionSchema } from '@/lib/validators/congestion'
import type { Result } from '@/types/result'

/**
 * 混雑度の報告（S_CAFE_DETAIL）。認可は cafe_congestion_reports_insert_own に委譲し、
 * ここでは入力の検証とエラーコード変換だけを行う。
 *
 * 連投のクールダウンは入れていない（スパム対策は MVP 見送り — pending-items A4）。
 * 報告し直しは UPDATE ではなく新規 INSERT（UPDATE / DELETE はポリシー自体が無い）
 *   supabase/migrations/20260906140100_create_cafe_congestion_reports.sql
 */

type ReportCongestionError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CAFE_NOT_FOUND'
  | 'INTERNAL_ERROR'

export async function reportCongestion(
  input: unknown,
): Promise<Result<CongestionSummary, ReportCongestionError>> {
  const parsed = reportCongestionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // insert しっぱなしにせず select() で返り行を確かめる。RLS に弾かれたケースが
  // エラーではなく「0件の成功」として返る経路があり、握ると弾かれたのに成功扱いになる
  const { data, error } = await supabase
    .from('cafe_congestion_reports')
    .insert({ cafe_id: parsed.data.cafeId, user_id: user.id, level: parsed.data.level })
    .select('id')
    .maybeSingle()

  if (error) {
    // 存在しない・削除済みのカフェID
    if (error.code === POSTGRES_FOREIGN_KEY_VIOLATION) return { ok: false, error: 'CAFE_NOT_FOUND' }
    // is_active_user() が偽（suspended / pending_consent）
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }

    console.error('[congestion] 混雑度の報告に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  if (!data) return { ok: false, error: 'FORBIDDEN' }

  // 他の閲覧者にも即反映されるよう、SSR のカフェ詳細を作り直す
  revalidatePath(`/cafes/${parsed.data.cafeId}`)

  // 報告直後の集計をそのまま返す。クライアントは楽観更新をこの値で置き換える
  // （自分の1件だけでなく他人の報告も混ざった平均になるため、自前では計算できない）
  return { ok: true, data: await getCafeCongestion(supabase, parsed.data.cafeId) }
}
