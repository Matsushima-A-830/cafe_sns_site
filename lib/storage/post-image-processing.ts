import exifr from 'exifr'
import type { Result } from '@/types/result'
import { POST_IMAGE_CONTENT_TYPE, POST_IMAGE_MAX_BYTES } from './post-images'

/**
 * ブラウザ側の投稿画像の前処理（EXIF除去・縮小・WebP変換）。
 *
 * アップロード（post-image-client.ts）とは別ファイルにする。あちらは Supabase の
 * ブラウザクライアント経由で lib/env.ts を読み込むため、同居させると
 * 「EXIF を必ず剥がす」というセキュリティ要件（CLAUDE.md）の単体テストに
 * 実行環境の環境変数が要るようになってしまう
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

export function scaledSize(width: number, height: number): { width: number; height: number } {
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
 * 10MB に収まる WebP が得られるまで品質を落として再エンコードする。
 * canvas を直接触らず encode 関数を受け取るのは、この判断部分だけを単体テストするため
 */
export async function encodeWithinLimit(
  encode: (quality: number) => Promise<Blob | null>,
): Promise<Result<Blob, ProcessPostImageError>> {
  let blob: Blob | null = null
  for (const quality of WEBP_QUALITIES) {
    blob = await encode(quality)
    if (blob && blob.size <= POST_IMAGE_MAX_BYTES) break
  }
  // WebP 非対応ブラウザでは toBlob が PNG にフォールバックする。署名付きURL発行は
  // image/webp 固定（validatePostImageUpload）なので、型が違う時点で弾く
  if (!blob || blob.type !== POST_IMAGE_CONTENT_TYPE) {
    return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
  }
  if (blob.size > POST_IMAGE_MAX_BYTES) return { ok: false, error: 'FILE_TOO_LARGE' }
  return { ok: true, data: blob }
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

    const encoded = await encodeWithinLimit((quality) => toWebpBlob(canvas, quality))
    if (!encoded.ok) return encoded

    const gps = await exifr.gps(encoded.data).catch(() => null)
    if (gps) return { ok: false, error: 'EXIF_STRIP_FAILED' }

    return { ok: true, data: { blob: encoded.data, width, height } }
  } finally {
    bitmap.close()
  }
}
