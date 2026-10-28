import { createClient } from '@/lib/supabase/browser'
import type { Result } from '@/types/result'
import { type ProcessCafeImageError, processCafeImage } from './cafe-image-processing'
import {
  CAFE_IMAGE_BUCKET,
  CAFE_IMAGE_CONTENT_TYPE,
  type CafeImageUploadTarget,
  type CreateCafeImageUploadUrlError,
  getCafeImagePublicUrl,
} from './cafe-images'

/**
 * カフェのメイン画像アップロード。読み書きを lib/storage/ に閉じ、S3 移行時の差し替え点を
 * ここだけに限定する（avatar-client.ts と同じ型。S_OWNER_CAFE_EDIT は Storage クライアントを
 * 直接触らない）
 *   docs/architecture/data-model/README.md #ストレージ設計
 */
export type UploadCafeImageError =
  | ProcessCafeImageError
  | CreateCafeImageUploadUrlError
  | 'INVALID_INPUT'

type SignResponse = Result<CafeImageUploadTarget, CreateCafeImageUploadUrlError | 'INVALID_INPUT'>

/**
 * 画像1枚を「EXIF除去 → 署名付きURL発行 → Storage へ直PUT」で確定する。
 * cafe-images は public バケットなので、返す publicUrl をそのまま cafes.main_image_path
 * （に変換する前のURL）として扱える
 */
export async function uploadCafeImage(
  file: File,
  cafeId: string,
): Promise<Result<{ path: string; publicUrl: string }, UploadCafeImageError>> {
  const processed = await processCafeImage(file)
  if (!processed.ok) return processed

  const response = await fetch('/api/uploads/cafe-image/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cafeId,
      contentType: CAFE_IMAGE_CONTENT_TYPE,
      fileSize: processed.data.blob.size,
    }),
  }).catch(() => null)

  if (!response?.ok) return { ok: false, error: 'UPLOAD_FAILED' }
  const signed = (await response.json().catch(() => null)) as SignResponse | null
  if (!signed) return { ok: false, error: 'UPLOAD_FAILED' }
  if (!signed.ok) return { ok: false, error: signed.error }

  const supabase = createClient()
  const { error } = await supabase.storage
    .from(CAFE_IMAGE_BUCKET)
    .uploadToSignedUrl(signed.data.path, signed.data.token, processed.data.blob, {
      contentType: CAFE_IMAGE_CONTENT_TYPE,
    })

  if (error) return { ok: false, error: 'UPLOAD_FAILED' }

  return {
    ok: true,
    data: { path: signed.data.path, publicUrl: getCafeImagePublicUrl(supabase, signed.data.path) },
  }
}

/**
 * 保存前に選び直した・画面を離れた場合の孤立ファイル削除（D64と同じ型）。uploadCafeImage は
 * 選択した時点で直PUTするため、保存されずに上書き・放棄されたアップロードは cafe-images に
 * 残り続ける。cafe_images_objects_delete_own RLS が is_cafe_owner(cafe_id) で削除権限を
 * 担保するため、ブラウザクライアントから直接 remove してよい
 */
export async function deleteUnsavedCafeImageFile(path: string): Promise<void> {
  const supabase = createClient()
  await supabase.storage.from(CAFE_IMAGE_BUCKET).remove([path])
}
