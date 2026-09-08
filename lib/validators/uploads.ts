import { z } from 'zod'

/**
 * ここでは形（型・必須）だけを検証する。サイズ上限・MIME判定は
 * createPostImageUploadUrl 内の validatePostImageUpload に一本化し、
 * FILE_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE を発生させる（error-catalog.md #アップロード--ストレージ）。
 * ここで同じ判定を重複させると、片方だけ変更した際にズレる
 */
export const uploadSignSchema = z.object({
  postId: z.string().uuid('投稿IDの形式が正しくありません'),
  contentType: z.string().min(1, 'ファイル形式を指定してください'),
  fileSize: z.number().int().positive('ファイルサイズを指定してください'),
})

export type UploadSignInput = z.infer<typeof uploadSignSchema>
