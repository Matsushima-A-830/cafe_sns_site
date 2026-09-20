import { FeedTabs } from '@/components/features/feed/feed-tabs'
import type { NotificationFilter } from '@/lib/validators/notifications'

/**
 * S_NOTIFICATIONS のフィルタタブ（すべて/フォロー/コメント/いいね）。
 * feed-tabs.tsx と同じ「状態をURLに持たせる」方式にする理由も同じ
 * （ディープリンク・認証状態ごとの出し分けの二重管理を避ける）
 *   docs/design/wireframes/mypage.md #S_NOTIFICATIONS
 */
const TABS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'follow', label: 'フォロー' },
  { key: 'comment', label: 'コメント' },
  { key: 'like', label: 'いいね' },
]

export function NotificationFilterTabs({ current }: { current: NotificationFilter }) {
  return (
    <FeedTabs
      label="通知の絞り込み"
      currentKey={current}
      tabs={TABS.map(({ key, label }) => ({
        key,
        label,
        href: key === 'all' ? '/notifications' : `/notifications?tab=${key}`,
      }))}
    />
  )
}
