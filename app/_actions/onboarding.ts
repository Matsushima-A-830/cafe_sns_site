'use server'

import { createClient } from '@/lib/supabase/server'
import {
  areaSchema,
  interestsSchema,
  profileSchema,
  usernameSchema,
} from '@/lib/validators/onboarding'
import type { Result } from '@/types/result'

const POSTGRES_UNIQUE_VIOLATION = '23505'

type SignupMetadata = {
  birth_date?: string
  age_category?: 'minor' | 'adult'
  guardian_email?: string
}

export async function checkUsernameAvailable(
  username: string,
): Promise<Result<{ available: boolean }>> {
  const parsed = usernameSchema.safeParse(username)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', parsed.data)
    .maybeSingle()
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  return { ok: true, data: { available: data === null } }
}

/**
 * profiles 行はここで初めて作られる。username / display_name / birth_date が揃うのが
 * この時点のため（docs/architecture/data-model/tables.md#profiles）。
 * birth_date は signup/birthdate で auth の user_metadata に一時保持したものを読む
 */
export async function submitProfile(input: unknown): Promise<Result<null>> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const metadata = user.user_metadata as SignupMetadata
  if (!metadata.birth_date || !metadata.age_category) {
    return { ok: false, error: 'INVALID_INPUT', details: '生年月日が未入力です' }
  }

  const status = metadata.age_category === 'minor' ? 'pending_consent' : 'active'

  const { error } = await supabase.from('profiles').insert({
    id: user.id,
    username: parsed.data.username,
    display_name: parsed.data.displayName,
    bio: parsed.data.bio ?? null,
    avatar_url: parsed.data.avatarUrl ?? null,
    birth_date: metadata.birth_date,
    status,
    guardian_email: metadata.guardian_email ?? null,
  })

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION)
      return { ok: false, error: 'USERNAME_ALREADY_EXISTS' }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  // status (pending_consent/active) が変わったので JWT クレイムを即時反映させる。
  // 更新しないと custom_access_token_hook が古い（profiles 行が無かった時点の）値のままになり、
  // middleware が誤判定する（docs/architecture/routing.md#カスタムクレイムの同期方式）
  await supabase.auth.refreshSession()

  return { ok: true, data: null }
}

export async function submitArea(input: unknown): Promise<Result<null>> {
  const parsed = areaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('profiles')
    .update({ home_area_code: parsed.data.areaCode ?? null })
    .eq('id', user.id)

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION) return { ok: false, error: 'AREA_CODE_UNKNOWN' }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  return { ok: true, data: null }
}

/**
 * 幹A: 唯一スキップ不可のステップ。1〜5個の occasion/mood タグを保存し、
 * 完了時に onboarded_at を書く（middleware が /onboarding へ誘導するか判定する唯一の材料）
 */
export async function submitInterests(input: unknown): Promise<Result<null>> {
  const parsed = interestsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error: insertError } = await supabase
    .from('user_interest_tags')
    .insert(parsed.data.tagIds.map((tagId) => ({ user_id: user.id, tag_id: tagId })))

  if (insertError) {
    if (insertError.code === POSTGRES_UNIQUE_VIOLATION) return { ok: false, error: 'CONFLICT' }
    return { ok: false, error: 'INTERNAL_ERROR', details: insertError.message }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateError) return { ok: false, error: 'INTERNAL_ERROR', details: updateError.message }

  // onboarded フラグを JWT に即時反映させる（submitProfile と同じ理由）
  await supabase.auth.refreshSession()

  return { ok: true, data: null }
}
