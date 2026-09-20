import { z } from 'zod'

/**
 * 既読化の入力。誰の通知かは必ずセッションから引くのでここには載せない
 * （bookmarkEntrySchema と同じ方針。他人の通知を既読化させないため）
 */
export const markNotificationReadSchema = z.object({
  notificationId: z.string().uuid(),
})

export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>

/** S_NOTIFICATIONS のフィルタタブ。'all' 以外は notifications.type に対応する */
export const NOTIFICATION_FILTERS = ['all', 'like', 'comment', 'follow'] as const
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]

export const notificationFilterSchema = z.enum(NOTIFICATION_FILTERS)
