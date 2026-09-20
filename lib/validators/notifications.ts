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

/** keyset カーソル。lib/notifications/notification-list.ts の NotificationListCursor と同じ形 */
export const notificationListCursorSchema = z.object({
  createdAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/),
  id: z.string().uuid(),
})

export const loadMoreNotificationsSchema = z.object({
  filter: notificationFilterSchema,
  cursor: notificationListCursorSchema,
})
