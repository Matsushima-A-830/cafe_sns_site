import type { Result } from '@/types/result'
import { AVATAR_MAX_BYTES } from './avatars'
import {
  type ProcessedPostImage,
  type ProcessPostImageError,
  processPostImage,
} from './post-image-processing'

/**
 * EXIF除去・回転焼き込み・GPS再検証ロジックは post と完全に同一のため
 * processPostImage を呼ぶだけの薄いラッパーにする（post-image-processing.ts の
 * ProcessImageOptions 引数化）。avatar固有なのは上限値だけ
 *   docs/product/pending-items.md D45
 */

/** アイコン用途なので投稿画像（2048px）より小さく抑える。96px表示の高DPI（@2x~@4x）を見込む */
const AVATAR_MAX_EDGE_PX = 512
const AVATAR_WEBP_QUALITIES = [0.85, 0.75, 0.65] as const

export type ProcessedAvatar = ProcessedPostImage
export type ProcessAvatarError = ProcessPostImageError

export async function processAvatarImage(
  file: File,
): Promise<Result<ProcessedAvatar, ProcessAvatarError>> {
  return processPostImage(file, {
    maxEdgePx: AVATAR_MAX_EDGE_PX,
    maxBytes: AVATAR_MAX_BYTES,
    qualities: AVATAR_WEBP_QUALITIES,
  })
}
