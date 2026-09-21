import { createClient } from '@/lib/supabase/browser'
import type { Result } from '@/types/result'
import {
  type CreateOwnerDocumentUploadUrlError,
  OWNER_DOCUMENT_BUCKET,
  type OwnerDocumentUploadTarget,
  validateOwnerDocumentUpload,
} from './owner-documents'

/**
 * 経営者認証書類のアップロード。読み書きを lib/storage/ に閉じる
 *   docs/architecture/data-model/README.md #ストレージ設計
 *   docs/architecture/data-model/README.md #owner-documents-は予約行方式を使わない
 *
 * post-images と違い EXIF 除去はしない。書類は位置情報のような個人の行動履歴を
 * 含む写真ではなく、証明書類のスキャン/撮影画像である想定のため
 */
export type UploadOwnerDocumentError = CreateOwnerDocumentUploadUrlError | 'INVALID_INPUT'

type SignResponse = Result<
  OwnerDocumentUploadTarget,
  CreateOwnerDocumentUploadUrlError | 'INVALID_INPUT'
>

/**
 * 書類1点を「署名付きURL発行 → Storage へ直PUT」で確定する。返すのは
 * document_urls に入るパス（{user_id}/{verification_id}/{uuid}.{ext}）
 */
export async function uploadOwnerDocument(
  verificationId: string,
  file: File,
): Promise<Result<{ path: string }, UploadOwnerDocumentError>> {
  const validated = validateOwnerDocumentUpload({ contentType: file.type, fileSize: file.size })
  if (!validated.ok) return validated

  const response = await fetch('/api/uploads/owner-document/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verificationId, contentType: file.type, fileSize: file.size }),
  }).catch(() => null)

  if (!response?.ok) return { ok: false, error: 'UPLOAD_FAILED' }
  const signed = (await response.json().catch(() => null)) as SignResponse | null
  if (!signed) return { ok: false, error: 'UPLOAD_FAILED' }
  if (!signed.ok) return { ok: false, error: signed.error }

  const supabase = createClient()
  const { error } = await supabase.storage
    .from(OWNER_DOCUMENT_BUCKET)
    .uploadToSignedUrl(signed.data.path, signed.data.token, file, { contentType: file.type })

  if (error) return { ok: false, error: 'UPLOAD_FAILED' }

  return { ok: true, data: { path: signed.data.path } }
}

/**
 * アップロード済み書類をユーザーが取り消したとき（申請送信前の削除ボタン）に呼ぶ。
 * owner_documents_objects_delete_own RLS がパス第1セグメント（user_id）のみで
 * 削除権限を担保するため、ブラウザクライアントから直接 remove してよい
 */
export async function deleteOwnerDocumentFile(
  path: string,
): Promise<Result<null, 'INTERNAL_ERROR'>> {
  const supabase = createClient()
  const { error } = await supabase.storage.from(OWNER_DOCUMENT_BUCKET).remove([path])
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: null }
}
