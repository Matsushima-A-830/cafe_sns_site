'use server'

import { createClient } from '@/lib/supabase/server'
import { markNotificationReadSchema } from '@/lib/validators/notifications'
import type { Result } from '@/types/result'

/**
 * 通知の既読化（S_NOTIFICATIONS）。認可は notifications_update_own に委譲する。
 *   supabase/migrations/20260920150000_create_notifications.sql
 *
 * 対象外（他人の通知・存在しない・既に既読）の update は0件成功で返るが、
 * bookmarks の unbookmarkPost と同じ理由でそのまま成功にしてよい
 * （二重クリックや既読済みでも「既読になっている」という結果は同じ）
 */

type MarkAsReadError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR'
type MarkAllAsReadError = 'UNAUTHENTICATED' | 'INTERNAL_ERROR'

export async function markNotificationAsRead(
  input: unknown,
): Promise<Result<null, MarkAsReadError>> {
  const parsed = markNotificationReadSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data.notificationId)
    .eq('recipient_id', user.id)
    .is('read_at', null)

  if (error) {
    console.error('[notifications] 既読化に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  // revalidatePath は呼ばない: /notifications も auth.getUser() で cookie を読む
  // 動的レンダリングで、そもそもキャッシュに載っていない（pending-items D23）
  return { ok: true, data: null }
}

export async function markAllNotificationsAsRead(): Promise<Result<null, MarkAllAsReadError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null)

  if (error) {
    console.error('[notifications] 一括既読化に失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  return { ok: true, data: null }
}
