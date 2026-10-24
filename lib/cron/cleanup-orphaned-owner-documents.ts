import type { SupabaseClient } from '@supabase/supabase-js'
import { reportError } from '@/lib/monitoring/report-error'
import { deleteOwnerDocuments, listAllOwnerDocumentPaths } from '@/lib/storage/owner-documents'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'

type Client = SupabaseClient<Database>

export type CleanupOrphanedOwnerDocumentsSummary = {
  deletedFileCount: number
}

/**
 * claimCafe（app/_actions/owner.ts）は書類アップロード完了後に1回だけ
 * cafe_owner_verifications 行をINSERTする設計で、D19の予約行方式のような
 * 「先に行だけ存在する」状態が無い。verificationId はコンポーネントマウント時に
 * 1回だけ生成される（owner-claim-form.tsx）ため、ページリロードで再送のあて先を
 * 失ったフォルダはその時点で恒久的に孤立する。D19が7日と長く取った理由
 * （ロールバックで再送中の行を誤検知する恐れ）はここには無いが、判断コストを
 * 優先してD19と揃える
 *   docs/product/pending-items.md D50
 */
const ORPHANED_OWNER_DOCUMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000

type DocumentUrlEntry = { type: string; path: string }

/**
 * owner-documents バケットの実ファイルと cafe_owner_verifications.document_urls を
 * 突き合わせ、どの行からも参照されていないファイルを削除する。
 *
 * cafe_owner_verifications にはDELETEポリシーが無く、approved/rejected/withdrawn
 * になった行も履歴保持のため永久に残る。孤立判定は status を問わず全行の
 * document_urls[].path と比較する1点のみで行い、statusで絞り込んではいけない
 * （approved済みの正当な書類を削除してしまう）
 *   supabase/migrations/20260921060000_create_cafe_owner_verifications.sql
 */
export async function cleanupOrphanedOwnerDocuments(
  supabase: Client,
): Promise<Result<CleanupOrphanedOwnerDocumentsSummary, 'INTERNAL_ERROR'>> {
  const [filesResult, verificationsResult] = await Promise.all([
    listAllOwnerDocumentPaths(supabase),
    supabase.from('cafe_owner_verifications').select('document_urls'),
  ])

  if (!filesResult.ok) {
    reportError('cleanup-orphaned-owner-documents', 'Storageの列挙に失敗', filesResult.details)
    return filesResult
  }
  if (verificationsResult.error) {
    reportError(
      'cleanup-orphaned-owner-documents',
      'cafe_owner_verificationsの取得に失敗',
      verificationsResult.error,
    )
    return { ok: false, error: 'INTERNAL_ERROR', details: verificationsResult.error.message }
  }

  const referencedPaths = new Set<string>()
  for (const row of verificationsResult.data) {
    const documentUrls = (row.document_urls ?? []) as DocumentUrlEntry[]
    for (const doc of documentUrls) referencedPaths.add(doc.path)
  }

  const cutoff = Date.now() - ORPHANED_OWNER_DOCUMENT_TTL_MS
  const orphanedPaths = filesResult.data
    .filter((file) => !referencedPaths.has(file.path))
    .filter((file) => new Date(file.createdAt).getTime() < cutoff)
    .map((file) => file.path)

  if (orphanedPaths.length === 0) {
    return { ok: true, data: { deletedFileCount: 0 } }
  }

  const deleted = await deleteOwnerDocuments(supabase, orphanedPaths)
  if (!deleted.ok) {
    reportError('cleanup-orphaned-owner-documents', 'Storageの削除に失敗', deleted.details)
    return deleted
  }

  return { ok: true, data: { deletedFileCount: orphanedPaths.length } }
}
