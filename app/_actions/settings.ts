'use server'

import { createClient } from '@/lib/supabase/server'
import { type UpdateSettingsInput, updateSettingsSchema } from '@/lib/validators/settings'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'

/**
 * S_SETTINGS の各トグル・セレクトの保存。認可は user_settings_update_own に委譲し、
 * ここでは入力の検証だけを行う。行は profiles 作成時のトリガーで必ず存在するため
 * upsert ではなく update でよい
 *   supabase/migrations/20260905130100_create_user_settings.sql
 */

type UpdateSettingsError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

type UserSettingsUpdate = Database['public']['Tables']['user_settings']['Update']

function toRow(input: UpdateSettingsInput): UserSettingsUpdate {
  const row: UserSettingsUpdate = {}
  if (input.notifyLike !== undefined) row.notify_like = input.notifyLike
  if (input.notifyComment !== undefined) row.notify_comment = input.notifyComment
  if (input.notifyFollow !== undefined) row.notify_follow = input.notifyFollow
  if (input.useLocation !== undefined) row.use_location = input.useLocation
  if (input.allowRecommendation !== undefined) row.allow_recommendation = input.allowRecommendation
  if (input.fontScale !== undefined) row.font_scale = input.fontScale
  return row
}

export async function updateSettings(input: unknown): Promise<Result<null, UpdateSettingsError>> {
  const parsed = updateSettingsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('user_settings')
    .update(toRow(parsed.data))
    .eq('user_id', user.id)

  if (error) {
    console.error('[settings] 設定の更新に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  return { ok: true, data: null }
}
