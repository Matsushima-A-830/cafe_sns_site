import type { Result } from '@/types/result'
import {
  type ProcessedPostImage,
  type ProcessPostImageError,
  processPostImage,
} from './post-image-processing'

/**
 * EXIF除去・回転焼き込み・GPS再検証ロジックは post と完全に同一のため
 * processPostImage を呼ぶだけの薄いラッパーにする（avatar-image-processing.ts と同じ型）。
 * 上限値も post-images と同じ（2048px・10MB、要判断D31）なので options を渡す必要が無い
 */

export type ProcessedCafeImage = ProcessedPostImage
export type ProcessCafeImageError = ProcessPostImageError

export async function processCafeImage(
  file: File,
): Promise<Result<ProcessedCafeImage, ProcessCafeImageError>> {
  return processPostImage(file)
}
