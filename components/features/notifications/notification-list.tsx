'use client'

import { useState, useTransition } from 'react'
import {
  loadMoreNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/app/_actions/notifications'
import { NotificationItem } from '@/components/features/notifications/notification-item'
import { Button } from '@/components/ui/button'
import type {
  NotificationListCursor,
  NotificationListPage,
} from '@/lib/notifications/notification-list'
import { errorMessage } from '@/lib/utils/error-messages'
import type { NotificationFilter } from '@/lib/validators/notifications'

/**
 * 通知一覧本体（S_NOTIFICATIONS）。初回ぶんはサーバーで描画済みのものを受け取り、
 * 「もっと見る」で keyset カーソルの続きを追記する（PostFeed と同じ理由 — pending-items D26）。
 *
 * 既読化は個々のクリック（NotificationItem 側）と「すべて既読」ボタンの両方から
 * 呼ばれるが、どちらも楽観的にローカル state を更新するだけで、確定値の読み直しはしない
 * （読み直しても readAt の有無しか変わらず、書き込み前後で表示が食い違うことは無い）
 */
export function NotificationList({
  initialPage,
  filter,
  viewerId,
  followingBackIds,
  emptyMessage,
}: {
  initialPage: NotificationListPage
  filter: NotificationFilter
  viewerId: string
  /** フォロー通知のフォローバックボタンの初期状態を出すための、既にフォロー中の actorId 集合 */
  followingBackIds: Set<string>
  emptyMessage: string
}) {
  const [items, setItems] = useState(initialPage.items)
  const [cursor, setCursor] = useState<NotificationListCursor | null>(initialPage.nextCursor)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleMarkRead(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    )
    // 背景で確定させる。ページ遷移をブロックしないため await しない
    void markNotificationAsRead({ notificationId: id })
  }

  function handleMarkAllRead() {
    const hasUnread = items.some((item) => item.readAt === null)
    if (!hasUnread) return

    const now = new Date().toISOString()
    setItems((current) =>
      current.map((item) => (item.readAt === null ? { ...item, readAt: now } : item)),
    )
    setError(null)

    startTransition(async () => {
      const result = await markAllNotificationsAsRead()
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setStatus('すべて既読にしました')
    })
  }

  function handleLoadMore() {
    if (!cursor) return
    setError(null)
    startTransition(async () => {
      const result = await loadMoreNotifications({ filter, cursor })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setItems((current) => [...current, ...result.data.items])
      setCursor(result.data.nextCursor)
    })
  }

  const hasUnread = items.some((item) => item.readAt === null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={!hasUnread || isPending}
        >
          すべて既読
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              viewerId={viewerId}
              initialFollowingBack={item.actor ? followingBackIds.has(item.actor.id) : false}
              onMarkRead={handleMarkRead}
            />
          ))}
        </ul>
      )}

      <p aria-live="polite" className="sr-only">
        {isPending ? '読み込み中' : status}
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={handleLoadMore} disabled={isPending}>
            {isPending ? '読み込み中…' : 'もっと見る'}
          </Button>
        </div>
      )}
    </div>
  )
}
