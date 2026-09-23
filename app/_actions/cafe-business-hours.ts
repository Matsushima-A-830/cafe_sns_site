'use server'

import { POSTGRES_INSUFFICIENT_PRIVILEGE } from '@/lib/constants/postgres-error-codes'
import { createClient } from '@/lib/supabase/server'
import { updateCafeBusinessHoursSchema } from '@/lib/validators/cafes'
import type { Result } from '@/types/result'

type UpdateCafeBusinessHoursError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'

/**
 * カフェの通常営業時間の編集（S_OWNER_CAFE_EDIT）。7曜日ぶんを丸ごと upsert する
 * （曜日単位の差分更新はUIの複雑さに見合わないため、常に週全体を送る）。
 * 認可は cafe_business_hours_update_owner / _insert_owner（is_cafe_owner）に委譲する
 *   supabase/migrations/20260906140000_create_cafe_business_hours.sql
 */
export async function updateCafeBusinessHours(
  input: unknown,
): Promise<Result<null, UpdateCafeBusinessHoursError>> {
  const parsed = updateCafeBusinessHoursSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const rows = parsed.data.hours.map((hour) => ({
    cafe_id: parsed.data.cafeId,
    day_of_week: hour.dayOfWeek,
    is_closed: hour.isClosed,
    opens_at: hour.isClosed ? null : (hour.opensAt ?? null),
    closes_at: hour.isClosed ? null : (hour.closesAt ?? null),
  }))

  const { error } = await supabase
    .from('cafe_business_hours')
    .upsert(rows, { onConflict: 'cafe_id,day_of_week' })

  if (error) {
    // is_cafe_owner(cafe_id) が偽、または is_active_user() が偽
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    console.error('[cafe-business-hours] 営業時間の更新に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  return { ok: true, data: null }
}
