import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'

/**
 * owner-documents バケットの読み書きはこのファイル経由に閉じる
 *   docs/architecture/data-model/README.md #ストレージ設計 移行を1箇所に閉じる
 *   docs/architecture/data-model/README.md #owner-documents-は予約行方式を使わない
 */
export const OWNER_DOCUMENT_BUCKET = 'owner-documents'
export const OWNER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const OWNER_DOCUMENT_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const
type OwnerDocumentContentType = (typeof OWNER_DOCUMENT_CONTENT_TYPES)[number]

const EXTENSION_BY_CONTENT_TYPE: Record<OwnerDocumentContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

type Client = SupabaseClient<Database>

export type OwnerDocumentUploadTarget = {
  path: string
  signedUrl: string
  token: string
}

type UploadValidationError = 'FILE_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
export type CreateOwnerDocumentUploadUrlError =
  | UploadValidationError
  | 'UNAUTHENTICATED'
  | 'INTERNAL_ERROR'
  | 'UPLOAD_FAILED'

function isOwnerDocumentContentType(value: string): value is OwnerDocumentContentType {
  return (OWNER_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(value)
}

/**
 * owner-documents/{user_id}/{verification_id}/{uuid}.{ext} 規約でパスを生成する。
 * verification_id は DB 行の存在確認を要求しない（申請確定前はまだ cafe_owner_verifications
 * 行が無いため）。クライアントから crypto.randomUUID() で生成した値をそのまま受け取り、
 * 同じ申請の書類を同じフォルダにまとめるためだけに使う
 */
export function buildOwnerDocumentPath(
  userId: string,
  verificationId: string,
  contentType: OwnerDocumentContentType,
): string {
  const ext = EXTENSION_BY_CONTENT_TYPE[contentType]
  return `${userId}/${verificationId}/${crypto.randomUUID()}.${ext}`
}

export function validateOwnerDocumentUpload(file: {
  contentType: string
  fileSize: number
}): Result<null, UploadValidationError> {
  if (!isOwnerDocumentContentType(file.contentType)) {
    return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
  }
  if (file.fileSize > OWNER_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: 'FILE_TOO_LARGE' }
  }
  return { ok: true, data: null }
}

/**
 * 署名付きアップロードURLを発行する。認可は storage.objects の RLS
 * （パス第1セグメント = user_id、owner_documents_objects_insert_own）のみで担保し、
 * is_post_author() 相当の DB 行検証はしない — verification_id はまだ行として
 * 存在しないため。user_id はセッションから導出する（詐称を防ぐため引数化しない）
 *   docs/architecture/data-model/README.md #owner-documents-は予約行方式を使わない
 */
export async function createOwnerDocumentUploadUrl(
  supabase: Client,
  params: { verificationId: string; contentType: string; fileSize: number },
): Promise<Result<OwnerDocumentUploadTarget, CreateOwnerDocumentUploadUrlError>> {
  const validated = validateOwnerDocumentUpload(params)
  if (!validated.ok) return validated
  // isOwnerDocumentContentType は validateOwnerDocumentUpload 内で確認済みだが、
  // 型を絞り込むためにここでも同じ関数を通す
  if (!isOwnerDocumentContentType(params.contentType)) {
    return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const path = buildOwnerDocumentPath(user.id, params.verificationId, params.contentType)
  const { data, error } = await supabase.storage
    .from(OWNER_DOCUMENT_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    return { ok: false, error: 'UPLOAD_FAILED', details: error?.message }
  }

  return { ok: true, data: { path: data.path, signedUrl: data.signedUrl, token: data.token } }
}

/**
 * アップロード失敗・申請中断時のロールバックで使う。
 * 注意: storage.objects の RLS に該当しないパスは、エラーにならず黙って削除対象から除外される
 */
export async function deleteOwnerDocuments(
  supabase: Client,
  paths: string[],
): Promise<Result<null, 'INTERNAL_ERROR'>> {
  if (paths.length === 0) return { ok: true, data: null }

  const { error } = await supabase.storage.from(OWNER_DOCUMENT_BUCKET).remove(paths)
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: null }
}
