import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { NotificationItem as NotificationItemData } from '@/lib/notifications/notification-list'
import { formatRelativeTime } from '@/lib/utils/format-date'
import { NotificationItem } from './notification-item'

vi.mock('@/app/_actions/follows', () => ({
  followUser: vi.fn().mockResolvedValue({ ok: true, data: null }),
  unfollowUser: vi.fn().mockResolvedValue({ ok: true, data: null }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const viewerId = '99999999-9999-4999-8999-999999999999'
const actorId = '11111111-1111-4111-8111-111111111111'

const actor = { id: actorId, username: 'actor_user', displayName: 'テスト太郎', avatarUrl: null }

function makeItem(overrides: Partial<NotificationItemData> = {}): NotificationItemData {
  return {
    id: 'notif-1',
    type: 'like',
    entityType: 'post',
    entityId: 'post-1',
    readAt: null,
    createdAt: new Date().toISOString(),
    actor,
    href: '/posts/post-1',
    ...overrides,
  }
}

describe('NotificationItem', () => {
  it('未読は「未読」チップを出す', () => {
    render(
      <NotificationItem
        item={makeItem({ readAt: null })}
        viewerId={viewerId}
        initialFollowingBack={false}
        onMarkRead={vi.fn()}
      />,
    )

    expect(screen.getByText('未読')).toBeInTheDocument()
    expect(screen.queryByText('既読')).toBeNull()
  })

  it('既読は「既読」チップを出す（色だけに依存しない）', () => {
    render(
      <NotificationItem
        item={makeItem({ readAt: new Date().toISOString() })}
        viewerId={viewerId}
        initialFollowingBack={false}
        onMarkRead={vi.fn()}
      />,
    )

    expect(screen.getByText('既読')).toBeInTheDocument()
  })

  it('like 通知は投稿へのリンクを持ち、クリックで既読化される', async () => {
    const onMarkRead = vi.fn()
    render(
      <NotificationItem
        item={makeItem({ type: 'like', href: '/posts/post-1', readAt: null })}
        viewerId={viewerId}
        initialFollowingBack={false}
        onMarkRead={onMarkRead}
      />,
    )

    expect(screen.getByText(/あなたの投稿にいいねしました/)).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/posts/post-1')

    await userEvent.click(link)
    expect(onMarkRead).toHaveBeenCalledWith('notif-1')
  })

  it('既読のものをクリックしても onMarkRead を呼ばない', async () => {
    const onMarkRead = vi.fn()
    render(
      <NotificationItem
        item={makeItem({ readAt: new Date().toISOString() })}
        viewerId={viewerId}
        initialFollowingBack={false}
        onMarkRead={onMarkRead}
      />,
    )

    await userEvent.click(screen.getByRole('link'))
    expect(onMarkRead).not.toHaveBeenCalled()
  })

  it('follow 通知はフォローバックボタンを、いいね/コメント通知は出さない', () => {
    const { rerender } = render(
      <NotificationItem
        item={makeItem({ type: 'follow', href: '/users/actor_user' })}
        viewerId={viewerId}
        initialFollowingBack={false}
        onMarkRead={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'フォロー' })).toBeInTheDocument()
    expect(screen.getByText(/あなたをフォローしました/)).toBeInTheDocument()

    rerender(
      <NotificationItem
        item={makeItem({ type: 'like' })}
        viewerId={viewerId}
        initialFollowingBack={false}
        onMarkRead={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'フォロー' })).toBeNull()
  })

  it('フォロー中なら「フォロー中」ボタンで出す', () => {
    render(
      <NotificationItem
        item={makeItem({ type: 'follow', href: '/users/actor_user' })}
        viewerId={viewerId}
        initialFollowingBack={true}
        onMarkRead={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'フォロー中' })).toBeInTheDocument()
  })

  it('href が無い（未実装typeの遷移先未解決）ときはリンクにしない', () => {
    render(
      <NotificationItem
        item={makeItem({ type: 'badge', href: null, actor: null })}
        viewerId={viewerId}
        initialFollowingBack={false}
        onMarkRead={vi.fn()}
      />,
    )

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('バッジを獲得しました')).toBeInTheDocument()
  })

  it('退会済み（actor null）の通知は「退会したユーザー」と表示する', () => {
    render(
      <NotificationItem
        item={makeItem({ type: 'like', actor: null })}
        viewerId={viewerId}
        initialFollowingBack={false}
        onMarkRead={vi.fn()}
      />,
    )

    expect(screen.getByText(/退会したユーザー があなたの投稿にいいねしました/)).toBeInTheDocument()
  })

  it('作成時刻は相対時刻表示になる（マウント後、D44）', () => {
    // now を固定し、コンポーネント内部の計算とアサーション側の計算がズレないようにする
    const fixedNow = new Date('2026-10-04T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)
    try {
      const createdAt = new Date(fixedNow.getTime() - 60_000).toISOString()
      render(
        <NotificationItem
          item={makeItem({ createdAt })}
          viewerId={viewerId}
          initialFollowingBack={false}
          onMarkRead={vi.fn()}
        />,
      )

      expect(screen.getByText(formatRelativeTime(createdAt, fixedNow))).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
