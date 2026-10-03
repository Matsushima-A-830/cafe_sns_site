import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'

/**
 * avatars バケットの読み書きはこのファイル経由に閉じる。S3移行時の差し替え点を
 * ここだけに限定するため、Server Actions / Route Handlers から Storage クライアントを直接呼ばない。
 *   docs/architecture/data-model/README.md #ストレージ設計
 */
export const AVATAR_BUCKET = 'avatars'
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_CONTENT_TYPE = 'image/webp'

type Client = SupabaseClient<Database>

export type AvatarUploadTarget = {
  path: string
  signedUrl: string
  token: string
}

type UploadValidationError = 'FILE_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'
export type CreateAvatarUploadUrlError =
  | UploadValidationError
  | 'UNAUTHENTICATED'
  | 'INTERNAL_ERROR'
  | 'UPLOAD_FAILED'

/**
 * avatars/{user_id}/{uuid}.webp 規約でパスを生成する。
 * 先頭セグメント（user_id）が storage.objects の RLS における書き込み権限の担保になる。
 *   docs/architecture/data-model/README.md #オブジェクトパスの規約
 */
export function buildAvatarPath(userId: string): string {
  return `${userId}/${crypto.randomUUID()}.webp`
}

/**
 * EXIF除去・WebP変換はクライアント側の責務（lib/storage/avatar-image-processing.ts）。
 * ここではアップロード前の最終ファイルに対してサイズ・形式のみ検証する
 */
export function validateAvatarUpload(file: {
  contentType: string
  fileSize: number
}): Result<null, UploadValidationError> {
  if (file.contentType !== AVATAR_CONTENT_TYPE) {
    return { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }
  }
  if (file.fileSize > AVATAR_MAX_BYTES) {
    return { ok: false, error: 'FILE_TOO_LARGE' }
  }
  return { ok: true, data: null }
}

/**
 * 署名付きアップロードURLを発行する。認可は storage.objects の RLS
 * （パス第1セグメント = user_id、avatars_objects_insert_own）のみで担保する。
 * user_id はセッションから導出する（詐称を防ぐため引数化しない）
 *   docs/architecture/data-model/README.md #オブジェクトパスの規約
 */
export async function createAvatarUploadUrl(
  supabase: Client,
  params: { contentType: string; fileSize: number },
): Promise<Result<AvatarUploadTarget, CreateAvatarUploadUrlError>> {
  const validated = validateAvatarUpload(params)
  if (!validated.ok) return validated

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const path = buildAvatarPath(user.id)
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUploadUrl(path)

  if (error || !data) {
    return { ok: false, error: 'UPLOAD_FAILED', details: error?.message }
  }

  return { ok: true, data: { path: data.path, signedUrl: data.signedUrl, token: data.token } }
}

/**
 * アバター差し替え時の旧ファイル削除で使う（D3: Storage オーファン掃除方針）。
 * 注意: storage.objects の RLS（削除権限がない対象）に該当するパスは、エラーにならず
 * 黙って削除対象から除外される。呼び出し元が渡す path は必ず本人が書き込んだものに限定すること
 */
export async function deleteAvatarFile(
  supabase: Client,
  path: string,
): Promise<Result<null, 'INTERNAL_ERROR'>> {
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: null }
}

/** avatars は public バケットなので署名不要。公開URLをそのまま返す */
export function getAvatarPublicUrl(supabase: Client, path: string): string {
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}
