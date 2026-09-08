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
/** post_images テーブルの BEFORE INSERT トリガー enforce_post_images_limit() と同じ上限。
 *  DB制約の実体は正としてトリガー側に残し、ここでは発行時点の事前チェック用に鏡写しする
 *    supabase/migrations/20260907120100_create_post_images.sql */
export const POST_IMAGE_MAX_COUNT = 10

type Client = SupabaseClient<Database>

export type PostImageUploadTarget = {
  path: string
  signedUrl: string
  token: string
}

type UploadValidationError = 'FILE_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
type CreateUploadUrlError =
  | UploadValidationError
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'POST_IMAGES_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR'
  | 'UPLOAD_FAILED'

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
 * 署名付きアップロードURLを発行する。認可は storage.objects の RLS に委譲するが、
 * postId 側は先頭セグメント(author_id)チェックだけでは検証できない（他人の postId でも
 * 自分のフォルダ配下になら発行できてしまう）ため、is_post_author() で本人の投稿か確認する。
 *
 * author_id はセッションから導出する（呼び出し元からの引数にすると詐称した値でも
 * バリデーションを通り、storage.objects の RLS 失敗というわかりにくい形でしか弾けない）。
 * 併せて post_images の件数を事前チェックし、10枚上限トリガーを迂回した孤立オブジェクトが
 * Storage に溜まるのを防ぐ（トリガー自体は post_images 行INSERT時にしか発火しないため）
 *   docs/architecture/routing.md POST /api/uploads/sign
 */
export async function createPostImageUploadUrl(
  supabase: Client,
  params: { postId: string; contentType: string; fileSize: number },
): Promise<Result<PostImageUploadTarget, CreateUploadUrlError>> {
  const validated = validatePostImageUpload(params)
  if (!validated.ok) return validated

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: 'UNAUTHENTICATED' }
  }
  const authorId = userData.user.id

  const isAuthor = await supabase.rpc('is_post_author', { p_post_id: params.postId })
  if (isAuthor.error) {
    return { ok: false, error: 'INTERNAL_ERROR', details: isAuthor.error.message }
  }
  if (!isAuthor.data) {
    return { ok: false, error: 'FORBIDDEN' }
  }

  const imageCount = await supabase
    .from('post_images')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', params.postId)
  if (imageCount.error) {
    return { ok: false, error: 'INTERNAL_ERROR', details: imageCount.error.message }
  }
  if ((imageCount.count ?? 0) >= POST_IMAGE_MAX_COUNT) {
    return { ok: false, error: 'POST_IMAGES_LIMIT_EXCEEDED' }
  }

  const path = buildPostImagePath(authorId, params.postId)
  const { data, error } = await supabase.storage.from(POST_IMAGE_BUCKET).createSignedUploadUrl(path)

  if (error || !data) {
    return { ok: false, error: 'UPLOAD_FAILED', details: error?.message }
  }

  return { ok: true, data: { path: data.path, signedUrl: data.signedUrl, token: data.token } }
}

/**
 * 投稿削除・アップロード失敗時のロールバックで使う。
 * 注意: storage.objects の RLS（削除権限がない対象）に該当するパスは、エラーにならず
 * 黙って削除対象から除外される。呼び出し元が渡す paths は必ず本人が書き込んだものに限定すること
 */
export async function deletePostImages(
  supabase: Client,
  paths: string[],
): Promise<Result<null, 'INTERNAL_ERROR'>> {
  if (paths.length === 0) return { ok: true, data: null }

  const { error } = await supabase.storage.from(POST_IMAGE_BUCKET).remove(paths)
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: null }
}

/** post-images は public バケットなので署名不要。公開URLをそのまま返す */
export function getPostImagePublicUrl(supabase: Client, path: string): string {
  return supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}
