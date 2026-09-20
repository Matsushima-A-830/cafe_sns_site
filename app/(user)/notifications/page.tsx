// S_NOTIFICATIONS: 通知
// 詳細: docs/design/wireframes/mypage.md#s_notifications通知 / docs/architecture/routing.md
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NotificationFilterTabs } from '@/components/features/notifications/notification-filter-tabs'
import { NotificationList } from '@/components/features/notifications/notification-list'
import { getNotificationList } from '@/lib/notifications/notification-list'
import { createClient } from '@/lib/supabase/server'
import { firstParam } from '@/lib/utils/search-params'
import { notificationFilterSchema } from '@/lib/validators/notifications'

// auth.getUser() で cookie を読む動的レンダリングになるため SSR（pending-items D23 と同じ経緯）

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = { title: '通知' }

const EMPTY_MESSAGES: Record<string, string> = {
  all: 'まだ通知はありません。',
  follow: 'フォローの通知はまだありません。',
  comment: 'コメントの通知はまだありません。',
  like: 'いいねの通知はまだありません。',
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // middleware が未ログインを /login へ送るので通常は到達しない。matcher の変更で
  // 無防備になるのを避けるため、ページ側でも自前で閉じる（S_MYPAGE と同じ形）
  if (!user) redirect('/login?next=%2Fnotifications')

  const parsedFilter = notificationFilterSchema.safeParse(firstParam(params.tab) ?? 'all')
  const filter = parsedFilter.success ? parsedFilter.data : 'all'

  const page = await getNotificationList(supabase, user.id, { filter })

  // フォロー通知の「フォローバック」初期状態。actorId ごとに問い合わせず1クエリでまとめて引く
  // （CLAUDE.md パフォーマンス「N+1回避」）
  const followActorIds = [
    ...new Set(
      page.items
        .filter((item) => item.type === 'follow' && item.actor)
        .map((item) => item.actor?.id)
        .filter((id): id is string => id != null),
    ),
  ]
  let followingBackIds = new Set<string>()
  if (followActorIds.length > 0) {
    const { data } = await supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', user.id)
      .in('followee_id', followActorIds)
    followingBackIds = new Set((data ?? []).map((row) => row.followee_id))
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground">通知</h1>

      <NotificationFilterTabs current={filter} />

      <NotificationList
        // フィルタが変わったら追記済みの一覧を破棄する（PostFeed/ExplorePage と同じ理由）
        key={filter}
        initialPage={page}
        filter={filter}
        viewerId={user.id}
        followingBackIds={followingBackIds}
        emptyMessage={EMPTY_MESSAGES[filter] ?? EMPTY_MESSAGES.all ?? 'まだ通知はありません。'}
      />
    </div>
  )
}
