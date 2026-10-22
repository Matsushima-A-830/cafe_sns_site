import type { SupabaseClient } from '@supabase/supabase-js'
import { reportError } from '@/lib/monitoring/report-error'
import { deletePostImages } from '@/lib/storage/post-images'
import type { Database, Json } from '@/types/database'
import type { Result } from '@/types/result'

type Client = SupabaseClient<Database>

export type CleanupExpiredDraftsSummary = {
  deletedDraftCount: number
  deletedImageCount: number
}

/** 1回の実行で処理する上限。GitHub Actions の日次実行なら十分で、タイムアウトを避ける */
const CLEANUP_BATCH_LIMIT = 500

/**
 * payload.image_paths を緩く取り出す。`v` 不一致の stale な payload でも
 * Storage の掃除だけは止めたくないため、draftPayloadSchema の厳格パースは使わない
 */
function extractImagePaths(payload: Json): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const paths = (payload as Record<string, unknown>).image_paths
  if (!Array.isArray(paths)) return []
  return paths.filter((path): path is string => typeof path === 'string')
}

/**
 * 期限切れ下書き（`drafts.expires_at < now()`）と、それが参照する post-images の
 * Storage オブジェクトを削除する。drafts の DELETE RLS は本人のみのため、
 * service_role クライアント（lib/supabase/admin.ts）前提で呼ぶこと
 *   docs/product/pending-items.md D3 / A6
 */
export async function cleanupExpiredDrafts(
  supabase: Client,
): Promise<Result<CleanupExpiredDraftsSummary, 'INTERNAL_ERROR'>> {
  // SELECTとDELETEの間に15秒デバウンスの自動保存(saveDraft)が割り込むと、
  // drafts_refresh_saved_at トリガーが対象行の expires_at を延長することがある。
  // 同じ cutoff を DELETE 側にも必ず付け、延長された行を消さないようにする
  const cutoff = new Date().toISOString()

  const { data, error } = await supabase
    .from('drafts')
    .select('id, payload')
    .lt('expires_at', cutoff)
    .limit(CLEANUP_BATCH_LIMIT)

  if (error) {
    reportError('cleanup-expired-drafts', 'drafts取得に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }
  if (data.length === 0) {
    return { ok: true, data: { deletedDraftCount: 0, deletedImageCount: 0 } }
  }

  const imagePaths = data.flatMap((row) => extractImagePaths(row.payload))

  if (imagePaths.length > 0) {
    const deleted = await deletePostImages(supabase, imagePaths)
    if (!deleted.ok) {
      reportError('cleanup-expired-drafts', 'Storage画像の削除に失敗', deleted.details)
      return { ok: false, error: 'INTERNAL_ERROR', details: deleted.details }
    }
  }

  const draftIds = data.map((row) => row.id)
  const { data: deletedRows, error: deleteError } = await supabase
    .from('drafts')
    .delete()
    .in('id', draftIds)
    .lt('expires_at', cutoff)
    .select('id')

  if (deleteError) {
    reportError('cleanup-expired-drafts', 'drafts行の削除に失敗', deleteError)
    return { ok: false, error: 'INTERNAL_ERROR', details: deleteError.message }
  }

  return {
    ok: true,
    data: { deletedDraftCount: deletedRows.length, deletedImageCount: imagePaths.length },
  }
}
