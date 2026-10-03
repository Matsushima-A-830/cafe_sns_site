'use server'

import { AVATAR_BUCKET, deleteAvatarFile } from '@/lib/storage/avatars'
import { verifyNoGpsExif } from '@/lib/storage/post-image-verify'
import { storagePathFromPublicUrl } from '@/lib/storage/public-url'
import { createClient } from '@/lib/supabase/server'
import { profileEditSchema } from '@/lib/validators/profiles'
import type { Result } from '@/types/result'

/**
 * S_PROFILE_EDIT の保存。display_name / bio / avatar_url を更新する。
 *
 * username はここで絶対に受け取らない・書かない — DB側も guard_privileged_profile_columns
 * トリガーで変更を拒否するが、ここではその手前で弾く（早期リターンの二重防御）
 *   supabase/migrations/20260923140000_guard_profile_username.sql
 */
type UpdateProfileError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'INTERNAL_ERROR'
  | 'EXIF_STRIP_FAILED'

export async function updateProfile(input: unknown): Promise<Result<null, UpdateProfileError>> {
  const parsed = profileEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { avatarUrl } = parsed.data

  // profileEditSchema が storagePathFromPublicUrl で検証済みのため avatarUrl は必ず
  // avatars バケットのパスへ解決できる（念のため null なら素通りさせず弾く）
  const newAvatarPath =
    avatarUrl !== undefined ? storagePathFromPublicUrl(AVATAR_BUCKET, avatarUrl) : null
  if (avatarUrl !== undefined && !newAvatarPath) {
    console.error('[profiles] avatarUrl がバリデーション済みのはずなのにパスへ解決できない')
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  // A10と同じ保険: 署名付きURL直PUTはサーバーがバイト列を検証できないため、
  // クライアント側のEXIF除去（processAvatarImage）が迂回された場合に備えて読み直して確認する
  //   docs/product/pending-items.md A10
  if (newAvatarPath) {
    const verified = await verifyNoGpsExif(supabase, [newAvatarPath], AVATAR_BUCKET)
    if (!verified.ok) {
      if (verified.error === 'EXIF_STRIP_FAILED') {
        // 検出した画像は再送しても使い回せない実害物なので Storage から削除する
        const deleted = await deleteAvatarFile(supabase, newAvatarPath)
        if (!deleted.ok) console.error('[profiles] GPS検出アバターの削除に失敗:', deleted.details)
      }
      return { ok: false, error: verified.error }
    }
  }

  // 旧ファイル削除（D3）のため、差し替え前に現在の avatar_url を控えておく。
  // avatarUrl が渡されない呼び出し（表示名/bioのみの保存）では往復を増やさない
  let previousAvatarUrl: string | null = null
  if (avatarUrl !== undefined) {
    const current = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
    if (current.error) {
      console.error('[profiles] 現在のアバター取得に失敗:', current.error)
      return { ok: false, error: 'INTERNAL_ERROR' }
    }
    previousAvatarUrl = current.data.avatar_url
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio || null,
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    })
    .eq('id', user.id)
    .select('id')
    .single()

  if (error) {
    console.error('[profiles] プロフィールの更新に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  // DB更新成功後に旧ファイルを削除する（D3対応案c）。失敗してもユーザー操作自体は
  // 成功しているため、ここでの失敗でアクション全体を失敗扱いにはしない（孤立は別途掃除の対象）
  if (avatarUrl !== undefined && previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
    const oldPath = storagePathFromPublicUrl(AVATAR_BUCKET, previousAvatarUrl)
    if (oldPath) {
      const deleted = await deleteAvatarFile(supabase, oldPath)
      if (!deleted.ok) console.error('[profiles] 旧アバターの削除に失敗:', deleted.details)
    }
  }

  return { ok: true, data: null }
}
