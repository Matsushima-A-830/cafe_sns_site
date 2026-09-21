import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * オーナー認証申請（S_OWNER_CLAIM/S_OWNER_PENDING）の読み取り。Server Component から
 * 呼ぶ純粋な読み取りなので Server Actions（app/_actions/owner.ts）とは分ける
 *   docs/architecture/data-model/tables.md #cafe_owner_verifications
 *
 * user_id は RLS（本人 + admin）任せにせず、必ずここで明示的に絞る。RLS の SELECT は
 * admin にも他人の行を見せる設計（S_ADMIN_OWNER_REVIEW 用）だが、この2関数は
 * 「呼び出し元本人の申請」だけを返す自己サービス用途なので、admin が誤って
 * 他人の申請を自分のものとして見る/操作する経路を作らない
 */

type Client = SupabaseClient<Database>

export type OwnerDocumentEntry = { type: string; path: string }

export type OwnerVerificationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export type OwnerVerificationSummary = {
  id: string
  cafeId: string
  status: OwnerVerificationStatus
  reviewNotes: string | null
  createdAt: string
  reviewedAt: string | null
}

export type OwnerVerificationWithCafe = OwnerVerificationSummary & {
  cafe: { id: string; name: string; areaLabel: string | null }
}

const SUMMARY_COLUMNS = 'id, cafe_id, status, review_notes, created_at, reviewed_at' as const

type SummaryRow = {
  id: string
  cafe_id: string
  status: string
  review_notes: string | null
  created_at: string
  reviewed_at: string | null
}

function toSummary(row: SummaryRow): OwnerVerificationSummary {
  return {
    id: row.id,
    cafeId: row.cafe_id,
    status: row.status as OwnerVerificationStatus,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }
}

/**
 * 現在のユーザーが対象カフェへ出した直近の申請。
 * S_OWNER_CLAIM で「既にpending → /owner/pendingへ誘導」「rejected → 却下理由を表示」に使う
 */
export async function getOwnerVerificationForCafe(
  supabase: Client,
  cafeId: string,
): Promise<OwnerVerificationSummary | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('cafe_owner_verifications')
    .select(SUMMARY_COLUMNS)
    .eq('cafe_id', cafeId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`オーナー認証申請の取得に失敗しました: ${error.message}`)
  return data ? toSummary(data) : null
}

/**
 * 現在のユーザーの直近の申請（カフェ横断で最新1件）。S_OWNER_PENDING の表示に使う。
 *
 * カフェ情報は cafes への埋め込み select ではなく get_owner_verification_cafe() RPC で取る。
 * cafes の SELECT RLS は status='active' のカフェしか見せないため、埋め込み select にすると
 * 申請中にカフェが closed/hidden になった時点で cafe が null になり、本人の申請自体が
 * 見えなくなってしまう（tables.md #cafe_owner_verifications 参照）
 */
export async function getLatestOwnerVerification(
  supabase: Client,
): Promise<OwnerVerificationWithCafe | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('cafe_owner_verifications')
    .select(SUMMARY_COLUMNS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`オーナー認証申請の取得に失敗しました: ${error.message}`)
  if (!data) return null

  const summary = toSummary(data)
  const { data: cafe, error: cafeError } = await supabase
    .rpc('get_owner_verification_cafe', { p_cafe_id: summary.cafeId })
    .maybeSingle()

  if (cafeError) throw new Error(`申請先カフェの取得に失敗しました: ${cafeError.message}`)
  if (!cafe) return null

  return { ...summary, cafe: { id: cafe.id, name: cafe.name, areaLabel: cafe.area_label } }
}
