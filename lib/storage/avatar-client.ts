import { createClient } from '@/lib/supabase/browser'
import type { Result } from '@/types/result'
import { type ProcessAvatarError, processAvatarImage } from './avatar-image-processing'
import {
  AVATAR_BUCKET,
  AVATAR_CONTENT_TYPE,
  type AvatarUploadTarget,
  type CreateAvatarUploadUrlError,
  getAvatarPublicUrl,
} from './avatars'

/**
 * アバター画像のアップロード。読み書きを lib/storage/ に閉じ、S3 移行時の差し替え点を
 * ここだけに限定する（S_PROFILE_EDIT は Storage クライアントを直接触らない）
 *   docs/architecture/data-model/README.md #ストレージ設計
 */
export type UploadAvatarError = ProcessAvatarError | CreateAvatarUploadUrlError | 'INVALID_INPUT'

type SignResponse = Result<AvatarUploadTarget, CreateAvatarUploadUrlError | 'INVALID_INPUT'>

/**
 * 画像1枚を「EXIF除去 → 署名付きURL発行 → Storage へ直PUT」で確定する。
 * avatars は public バケットなので、返す publicUrl をそのまま profiles.avatar_url に保存できる
 */
export async function uploadAvatar(
  file: File,
): Promise<Result<{ path: string; publicUrl: string }, UploadAvatarError>> {
  const processed = await processAvatarImage(file)
  if (!processed.ok) return processed

  const response = await fetch('/api/uploads/avatar/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: AVATAR_CONTENT_TYPE,
      fileSize: processed.data.blob.size,
    }),
  }).catch(() => null)

  if (!response?.ok) return { ok: false, error: 'UPLOAD_FAILED' }
  const signed = (await response.json().catch(() => null)) as SignResponse | null
  if (!signed) return { ok: false, error: 'UPLOAD_FAILED' }
  if (!signed.ok) return { ok: false, error: signed.error }

  const supabase = createClient()
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .uploadToSignedUrl(signed.data.path, signed.data.token, processed.data.blob, {
      contentType: AVATAR_CONTENT_TYPE,
    })

  if (error) return { ok: false, error: 'UPLOAD_FAILED' }

  return {
    ok: true,
    data: { path: signed.data.path, publicUrl: getAvatarPublicUrl(supabase, signed.data.path) },
  }
}

/**
 * 保存前に選び直した・画面を離れた場合の孤立ファイル削除（D64）。uploadAvatar は選択した
 * 時点で直PUTするため、保存されずに上書き・放棄されたアップロードは avatars に残り続ける。
 * avatars_objects_delete_own RLS がパス第1セグメント（user_id）のみで削除権限を担保するため、
 * ブラウザクライアントから直接 remove してよい（owner-document-client.ts と同じ型）
 */
export async function deleteUnsavedAvatarFile(path: string): Promise<void> {
  const supabase = createClient()
  await supabase.storage.from(AVATAR_BUCKET).remove([path])
}
