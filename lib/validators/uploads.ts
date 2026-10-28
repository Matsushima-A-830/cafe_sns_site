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

/** owner-documents 版。サイズ上限・MIME判定は validateOwnerDocumentUpload に一本化する */
export const ownerDocumentUploadSignSchema = z.object({
  verificationId: z.string().uuid('申請IDの形式が正しくありません'),
  contentType: z.string().min(1, 'ファイル形式を指定してください'),
  fileSize: z.number().int().positive('ファイルサイズを指定してください'),
})

export type OwnerDocumentUploadSignInput = z.infer<typeof ownerDocumentUploadSignSchema>

/**
 * avatars 版。entity ID が無いぶん post/owner-document 版より単純
 * （{user_id}/{uuid}.webp は user_id をセッションから導出するため）。
 * サイズ上限・MIME判定は validateAvatarUpload に一本化する
 */
export const avatarUploadSignSchema = z.object({
  contentType: z.string().min(1, 'ファイル形式を指定してください'),
  fileSize: z.number().int().positive('ファイルサイズを指定してください'),
})

export type AvatarUploadSignInput = z.infer<typeof avatarUploadSignSchema>

/** cafe-images 版。サイズ上限・MIME判定は validateCafeImageUpload に一本化する */
export const cafeImageUploadSignSchema = z.object({
  cafeId: z.string().uuid('カフェIDの形式が正しくありません'),
  contentType: z.string().min(1, 'ファイル形式を指定してください'),
  fileSize: z.number().int().positive('ファイルサイズを指定してください'),
})

export type CafeImageUploadSignInput = z.infer<typeof cafeImageUploadSignSchema>
