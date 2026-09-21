'use server'

import { createClient } from '@/lib/supabase/server'
import { profileEditSchema } from '@/lib/validators/profiles'
import type { Result } from '@/types/result'

/**
 * S_PROFILE_EDIT の保存。display_name / bio のみを更新する。
 *
 * username はここで絶対に受け取らない・書かない — アプリ層の「変更不可」はDB制約ではなく
 * このスキーマ（profileEditSchema）に username フィールドが無いことだけで担保している
 *   supabase/migrations/20260905130000_create_profiles.sql profiles_update_self
 */
type UpdateProfileError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

export async function updateProfile(input: unknown): Promise<Result<null, UpdateProfileError>> {
  const parsed = profileEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: parsed.data.displayName,
      bio: parsed.data.bio || null,
    })
    .eq('id', user.id)
    .select('id')
    .single()

  if (error) {
    console.error('[profiles] プロフィールの更新に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  return { ok: true, data: null }
}
