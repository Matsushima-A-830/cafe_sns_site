import exifr from 'exifr'
import { createClient } from '@/lib/supabase/browser'
import type { Result } from '@/types/result'
import {
  type CreateUploadUrlError,
  POST_IMAGE_BUCKET,
  POST_IMAGE_CONTENT_TYPE,
  POST_IMAGE_MAX_BYTES,
  type PostImageUploadTarget,
} from './post-images'

/**
 * ブラウザ側の投稿画像処理（EXIF除去・WebP変換・アップロード）。
 * サーバー側の lib/storage/post-images.ts と対になる。S3 移行時の差し替え点を
 * lib/storage/ に閉じるため、composer からは Storage クライアントを直接触らない
 *   docs/architecture/data-model/README.md #ストレージ設計
 */

/** 表示用途に対してこれ以上は無駄に重いだけ。長辺をここまで縮めてから WebP 化する */
const MAX_EDGE_PX = 2048
/** 10MB 上限（POST_IMAGE_MAX_BYTES）を超えたら段階的に品質を落として再エンコードする */
const WEBP_QUALITIES = [0.82, 0.7, 0.6]
/** デコード前の生ファイル上限。巨大画像で createImageBitmap がメモリを食い潰すのを防ぐ */
const SOURCE_MAX_BYTES = 25 * 1024 * 1024

export type ProcessedPostImage = {
  blob: Blob
  width: number
  height: number
}

export type ProcessPostImageError =
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'FILE_TOO_LARGE'
  | 'EXIF_STRIP_FAILED'

export type UploadPostImageError = ProcessPostImageError | CreateUploadUrlError | 'INVALID_INPUT'

function scaledSize(width: number, height: number): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= MAX_EDGE_PX) return { width, height }
  const ratio = MAX_EDGE_PX / longEdge
  // 0px のキャンバスは toBlob が null を返すため、極端なアスペクト比でも最低1pxを残す
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

function toWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, POST_IMAGE_CONTENT_TYPE, quality))
}

/**
 * EXIF を剥がして WebP に変換する。canvas への再描画でメタデータは構造的に落ちるが、
 * 位置情報の流出は取り返しがつかないため、出力を exifr で読み直して GPS が
 * 残っていないことまで確認する（CLAUDE.md セキュリティと安全）。
 * 回転情報も同時に失われるため、デコード時に imageOrientation で焼き込む
 */
export async function processPostImage(
  file: File,
): Promise<Result<ProcessedPostImage, ProcessPostImageError>> {
  if (!file.type.startsWith('image/')) return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
  if (file.size > SOURCE_MAX_BYTES) return { ok: false, error: 'FILE_TOO_LARGE' }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
  }

  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return { ok: false, error: 'EXIF_STRIP_FAILED' }
    context.drawImage(bitmap, 0, 0, width, height)

    let blob: Blob | null = null
    for (const quality of WEBP_QUALITIES) {
      blob = await toWebpBlob(canvas, quality)
      if (blob && blob.size <= POST_IMAGE_MAX_BYTES) break
    }
    // WebP 非対応ブラウザでは toBlob が PNG にフォールバックする。署名付きURL発行は
    // image/webp 固定（validatePostImageUpload）なので、型が違う時点で弾く
    if (!blob || blob.type !== POST_IMAGE_CONTENT_TYPE) {
      return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
    }
    if (blob.size > POST_IMAGE_MAX_BYTES) return { ok: false, error: 'FILE_TOO_LARGE' }

    const gps = await exifr.gps(blob).catch(() => null)
    if (gps) return { ok: false, error: 'EXIF_STRIP_FAILED' }

    return { ok: true, data: { blob, width, height } }
  } finally {
    bitmap.close()
  }
}

type SignResponse = Result<PostImageUploadTarget, CreateUploadUrlError | 'INVALID_INPUT'>

/**
 * 画像1枚を「EXIF除去 → 署名付きURL発行 → Storage へ直PUT」で確定する。
 * 返すのは post_images.storage_path に入るパス（{author_id}/{postId}/{uuid}.webp）で、
 * 投稿確定（createPost）まではこのパスだけを composer の state と drafts が持ち回る
 */
export async function uploadPostImage(
  postId: string,
  file: File,
): Promise<Result<{ path: string; width: number; height: number }, UploadPostImageError>> {
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

  return {
    ok: true,
    data: { path: signed.data.path, width: processed.data.width, height: processed.data.height },
  }
}
