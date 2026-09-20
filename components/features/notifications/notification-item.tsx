'use client'

import { Bell, Heart, MessageCircle, UserPlus } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { FollowButton } from '@/components/features/profiles/follow-button'
import type { NotificationItem as NotificationItemData } from '@/lib/notifications/notification-list'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { cn } from '@/lib/utils/cn'
import { formatRelativeTime } from '@/lib/utils/format-date'

/**
 * 通知1件（S_NOTIFICATIONS）。
 *
 * 未読/既読は色だけに依存させない — チップの文言自体を「未読」「既読」に変える
 * （LikeButton/BookmarkButton の「ラベル自体を変える」方針に揃える）。
 *
 * フォローバックボタン（FollowButton）は <Link> の外に置く。<a> の中に <button> を
 * ネストすると無効なHTMLになるうえ、押した瞬間にリンク側のクリックも発火して
 * 通知詳細への遷移とフォローが同時に起きてしまう
 */

const TYPE_ICONS: Record<string, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
}

function notificationText(item: NotificationItemData): string {
  const name = item.actor?.displayName ?? '退会したユーザー'
  switch (item.type) {
    case 'like':
      return `${name} があなたの投稿にいいねしました`
    case 'comment':
      return `${name} がコメントしました`
    case 'follow':
      return `${name} があなたをフォローしました`
    case 'mention':
      return `${name} があなたをメンションしました`
    case 'badge':
      return 'バッジを獲得しました'
    case 'owner_verified':
      return 'カフェのオーナー認証が完了しました'
    case 'regular_awarded':
      return '常連に認定されました'
    case 'official_post':
      return '気になっているカフェから新しい投稿がありました'
    case 'report_resolved':
      return '通報の対応が完了しました'
    default:
      return '新しい通知があります'
  }
}

export function NotificationItem({
  item,
  viewerId,
  initialFollowingBack,
  onMarkRead,
}: {
  item: NotificationItemData
  viewerId: string
  initialFollowingBack: boolean
  onMarkRead: (id: string) => void
}) {
  const Icon = TYPE_ICONS[item.type] ?? Bell
  const unread = item.readAt === null
  const avatarUrl =
    item.actor?.avatarUrl && isStoragePublicUrl(item.actor.avatarUrl) ? item.actor.avatarUrl : null

  const body = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon className="size-5" />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-base text-foreground">{notificationText(item)}</p>
        <time dateTime={item.createdAt} className="text-sm text-muted-foreground">
          {formatRelativeTime(item.createdAt)}
        </time>
      </div>
    </div>
  )

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border-default bg-surface p-4">
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-1 text-xs font-bold',
          unread ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {unread ? '未読' : '既読'}
      </span>

      {item.href ? (
        <Link
          href={item.href}
          onClick={() => unread && onMarkRead(item.id)}
          className="flex min-w-0 flex-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          {body}
        </Link>
      ) : (
        body
      )}

      {item.type === 'follow' && item.actor && item.actor.id !== viewerId && (
        <div className="shrink-0">
          <FollowButton followeeId={item.actor.id} initialFollowing={initialFollowingBack} />
        </div>
      )}
    </li>
  )
}
