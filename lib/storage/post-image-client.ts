import { createClient } from '@/lib/supabase/browser'
import type { Result } from '@/types/result'
import { type ProcessPostImageError, processPostImage } from './post-image-processing'
import {
  type CreateUploadUrlError,
  POST_IMAGE_BUCKET,
  POST_IMAGE_CONTENT_TYPE,
  type PostImageUploadTarget,
} from './post-images'

/**
 * 投稿画像のアップロード。読み書きを lib/storage/ に閉じ、S3 移行時の差し替え点を
 * ここだけに限定する（composer は Storage クライアントを直接触らない）
 *   docs/architecture/data-model/README.md #ストレージ設計
 */

export type UploadPostImageError = ProcessPostImageError | CreateUploadUrlError | 'INVALID_INPUT'

type SignResponse = Result<PostImageUploadTarget, CreateUploadUrlError | 'INVALID_INPUT'>

/**
 * 画像1枚を「EXIF除去 → 署名付きURL発行 → Storage へ直PUT」で確定する。
 * 返すのは post_images.storage_path に入るパス（{author_id}/{postId}/{uuid}.webp）で、
 * 投稿確定（createPost）まではこのパスだけを composer の state と drafts が持ち回る
 */
export async function uploadPostImage(
  postId: string,
  file: File,
): Promise<
  Result<{ path: string; width: number; height: number; blob: Blob }, UploadPostImageError>
> {
  const processed = await processPostImage(file)
  if (!processed.ok) return processed

  const response = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postId,
      contentType: POST_IMAGE_CONTENT_TYPE,
      fileSize: processed.data.blob.size,
    }),
  }).catch(() => null)

  if (!response?.ok) return { ok: false, error: 'UPLOAD_FAILED' }
  const signed = (await response.json().catch(() => null)) as SignResponse | null
  if (!signed) return { ok: false, error: 'UPLOAD_FAILED' }
  // 署名APIのエラーコードはそのまま返す（POST_IMAGES_LIMIT_EXCEEDED 等は UI で個別表示したい）
  if (!signed.ok) return { ok: false, error: signed.error }

  const supabase = createClient()
  const { error } = await supabase.storage
    .from(POST_IMAGE_BUCKET)
    .uploadToSignedUrl(signed.data.path, signed.data.token, processed.data.blob, {
      contentType: POST_IMAGE_CONTENT_TYPE,
    })

  if (error) return { ok: false, error: 'UPLOAD_FAILED' }

  // blob も返す。プレビューに元ファイルの object URL を使うと、iPhone の HEIC が
  // Chrome/Firefox で描画できず「アップロードは成功したのにプレビューだけ壊れる」状態になる
  return {
    ok: true,
    data: {
      path: signed.data.path,
      width: processed.data.width,
      height: processed.data.height,
      blob: processed.data.blob,
    },
  }
}
