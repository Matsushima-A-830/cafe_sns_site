import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'

/**
 * post-images バケットの読み書きはこのファイル経由に閉じる。S3移行時の差し替え点を
 * ここだけに限定するため、Server Actions / Route Handlers から Storage クライアントを直接呼ばない。
 *   docs/architecture/data-model/README.md #ストレージ設計 移行を1箇所に閉じる
 */
export const POST_IMAGE_BUCKET = 'post-images'
export const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const POST_IMAGE_CONTENT_TYPE = 'image/webp'

type Client = SupabaseClient<Database>

export type PostImageUploadTarget = {
  path: string
  signedUrl: string
  token: string
}

type UploadValidationError = 'FILE_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'

/**
 * post-images/{author_id}/{post_id}/{uuid}.webp 規約でパスを生成する。
 * 先頭セグメント（author_id）が storage.objects の RLS における書き込み権限の担保になる。
 *   docs/architecture/data-model/README.md #オブジェクトパスの規約
 */
export function buildPostImagePath(authorId: string, postId: string): string {
  return `${authorId}/${postId}/${crypto.randomUUID()}.webp`
}

/**
 * EXIF除去・WebP変換はクライアント側の責務（tables.md #post_images）。
 * ここではアップロード前の最終ファイルに対してサイズ・形式のみ検証する
 */
export function validatePostImageUpload(file: {
  contentType: string
  fileSize: number
}): Result<null, UploadValidationError> {
  if (file.contentType !== POST_IMAGE_CONTENT_TYPE) {
    return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
  }
  if (file.fileSize > POST_IMAGE_MAX_BYTES) {
    return { ok: false, error: 'FILE_TOO_LARGE' }
  }
  return { ok: true, data: null }
}

/**
 * 署名付きアップロードURLを発行する。認可は storage.objects の RLS に委譲し、
 * ここでは事前にサイズ・形式のみ弾く（authorId は呼び出し元がセッションのユーザーIDを渡す前提）。
 *   docs/architecture/routing.md POST /api/uploads/sign
 */
export async function createPostImageUploadUrl(
  supabase: Client,
  params: { authorId: string; postId: string; contentType: string; fileSize: number },
): Promise<Result<PostImageUploadTarget, UploadValidationError | 'UPLOAD_FAILED'>> {
  const validated = validatePostImageUpload(params)
  if (!validated.ok) return validated

  const path = buildPostImagePath(params.authorId, params.postId)
  const { data, error } = await supabase.storage.from(POST_IMAGE_BUCKET).createSignedUploadUrl(path)

  if (error || !data) {
    return { ok: false, error: 'UPLOAD_FAILED', details: error?.message }
  }

  return { ok: true, data: { path: data.path, signedUrl: data.signedUrl, token: data.token } }
}

/** 投稿削除・アップロード失敗時のロールバックで使う */
export async function deletePostImages(
  supabase: Client,
  paths: string[],
): Promise<Result<null, 'UPLOAD_FAILED'>> {
  if (paths.length === 0) return { ok: true, data: null }

  const { error } = await supabase.storage.from(POST_IMAGE_BUCKET).remove(paths)
  if (error) return { ok: false, error: 'UPLOAD_FAILED', details: error.message }
  return { ok: true, data: null }
}

/** post-images は public バケットなので署名不要。公開URLをそのまま返す */
export function getPostImagePublicUrl(supabase: Client, path: string): string {
  return supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}
