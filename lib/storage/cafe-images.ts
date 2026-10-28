import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'

/**
 * cafe-images バケットの読み書きはこのファイル経由に閉じる。S3移行時の差し替え点を
 * ここだけに限定するため、Server Actions / Route Handlers から Storage クライアントを直接呼ばない。
 *   docs/architecture/data-model/README.md #ストレージ設計
 */
export const CAFE_IMAGE_BUCKET = 'cafe-images'
export const CAFE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const CAFE_IMAGE_CONTENT_TYPE = 'image/webp'

type Client = SupabaseClient<Database>

export type CafeImageUploadTarget = {
  path: string
  signedUrl: string
  token: string
}

type UploadValidationError = 'FILE_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
export type CreateCafeImageUploadUrlError =
  | UploadValidationError
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'UPLOAD_FAILED'

/**
 * cafe-images/{cafe_id}/{uuid}.webp 規約でパスを生成する。
 * 先頭セグメントが post-images/avatars と違い owner の user_id ではなく cafe_id になる点に
 * 注意（storage.objects の RLS は is_cafe_owner(cafe_id) で判定する。cafe-images-storage の
 * マイグレーション参照）
 *   docs/architecture/data-model/README.md #オブジェクトパスの規約
 */
export function buildCafeImagePath(cafeId: string): string {
  return `${cafeId}/${crypto.randomUUID()}.webp`
}

/**
 * EXIF除去・WebP変換はクライアント側の責務（lib/storage/cafe-image-processing.ts）。
 * ここではアップロード前の最終ファイルに対してサイズ・形式のみ検証する
 */
export function validateCafeImageUpload(file: {
  contentType: string
  fileSize: number
}): Result<null, UploadValidationError> {
  if (file.contentType !== CAFE_IMAGE_CONTENT_TYPE) {
    return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
  }
  if (file.fileSize > CAFE_IMAGE_MAX_BYTES) {
    return { ok: false, error: 'FILE_TOO_LARGE' }
  }
  return { ok: true, data: null }
}

/**
 * 署名付きアップロードURLを発行する。cafe_id は先頭セグメントの等価チェックだけでは
 * 検証できない（他人のカフェIDでも自分の user_id フォルダになら発行できてしまう、という
 * post-images の postId と同じ事情）ため、is_cafe_owner() で本人のカフェか確認する。
 * cafe_images_objects_insert_own RLS と同じく is_admin() もORで許す（モデレーション目的で
 * 他人のカフェのメイン画像を差し替える場面を想定）
 *   docs/architecture/routing.md POST /api/uploads/sign
 */
export async function createCafeImageUploadUrl(
  supabase: Client,
  params: { cafeId: string; contentType: string; fileSize: number },
): Promise<Result<CafeImageUploadTarget, CreateCafeImageUploadUrlError>> {
  const validated = validateCafeImageUpload(params)
  if (!validated.ok) return validated

  const [userResult, isOwnerResult, isAdminResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('is_cafe_owner', { p_cafe_id: params.cafeId }),
    supabase.rpc('is_admin'),
  ])

  if (userResult.error || !userResult.data.user) {
    return { ok: false, error: 'UNAUTHENTICATED' }
  }

  if (isOwnerResult.error) {
    return { ok: false, error: 'INTERNAL_ERROR', details: isOwnerResult.error.message }
  }
  if (isAdminResult.error) {
    return { ok: false, error: 'INTERNAL_ERROR', details: isAdminResult.error.message }
  }
  if (!isOwnerResult.data && !isAdminResult.data) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  const path = buildCafeImagePath(params.cafeId)
  const { data, error } = await supabase.storage.from(CAFE_IMAGE_BUCKET).createSignedUploadUrl(path)

  if (error || !data) {
    return { ok: false, error: 'UPLOAD_FAILED', details: error?.message }
  }

  return { ok: true, data: { path: data.path, signedUrl: data.signedUrl, token: data.token } }
}

/**
 * メイン画像差し替え時の旧ファイル削除、保存前の選び直し・離脱時クリーンアップ（D64と同じ型）で使う。
 * 注意: storage.objects の RLS（削除権限がない対象）に該当するパスは、エラーにならず
 * 黙って削除対象から除外される。呼び出し元が渡す path は必ず本人のカフェのものに限定すること
 */
export async function deleteCafeImageFile(
  supabase: Client,
  path: string,
): Promise<Result<null, 'INTERNAL_ERROR'>> {
  const { error } = await supabase.storage.from(CAFE_IMAGE_BUCKET).remove([path])
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: null }
}

/** cafe-images は public バケットなので署名不要。公開URLをそのまま返す */
export function getCafeImagePublicUrl(supabase: Client, path: string): string {
  return supabase.storage.from(CAFE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}
