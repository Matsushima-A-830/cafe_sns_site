import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationListPage } from '@/lib/notifications/notification-list'
import { NotificationList } from './notification-list'

const loadMoreNotifications = vi.fn()
const markAllNotificationsAsRead = vi.fn()
const markNotificationAsRead = vi.fn()

vi.mock('@/app/_actions/notifications', () => ({
  loadMoreNotifications: (input: unknown) => loadMoreNotifications(input),
  markAllNotificationsAsRead: () => markAllNotificationsAsRead(),
  markNotificationAsRead: (input: unknown) => markNotificationAsRead(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const viewerId = '99999999-9999-4999-8999-999999999999'

function makePage(overrides: Partial<NotificationListPage> = {}): NotificationListPage {
  return {
    items: [
      {
        id: 'notif-1',
        type: 'like',
        entityType: 'post',
        entityId: 'post-1',
        readAt: null,
        createdAt: new Date().toISOString(),
        actor: { id: 'actor-1', username: 'actor1', displayName: '太郎', avatarUrl: null },
        href: '/posts/post-1',
      },
    ],
    nextCursor: null,
    ...overrides,
  }
}

beforeEach(() => {
  loadMoreNotifications.mockReset()
  markAllNotificationsAsRead.mockReset()
  markNotificationAsRead.mockReset()
  markNotificationAsRead.mockResolvedValue({ ok: true, data: null })
  markAllNotificationsAsRead.mockResolvedValue({ ok: true, data: null })
})

describe('NotificationList', () => {
  it('通知が無ければ空状態メッセージを出す', () => {
    render(
      <NotificationList
        initialPage={{ items: [], nextCursor: null }}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage="まだ通知はありません。"
      />,
    )

    expect(screen.getByText('まだ通知はありません。')).toBeInTheDocument()
  })

  it('カーソルが無ければ「もっと見る」を出さない', () => {
    render(
      <NotificationList
        initialPage={makePage()}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage=""
      />,
    )

    expect(screen.queryByRole('button', { name: /もっと見る/ })).toBeNull()
  })

  it('「もっと見る」で次ページを追記する', async () => {
    loadMoreNotifications.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: 'notif-2',
            type: 'follow',
            entityType: 'user',
            entityId: 'actor-2',
            readAt: null,
            createdAt: new Date().toISOString(),
            actor: { id: 'actor-2', username: 'actor2', displayName: '次郎', avatarUrl: null },
            href: '/users/actor2',
          },
        ],
        nextCursor: null,
      },
    })

    render(
      <NotificationList
        initialPage={makePage({
          nextCursor: { createdAt: '2026-01-01T00:00:00Z', id: 'notif-1' },
        })}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage=""
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /もっと見る/ }))

    await waitFor(() =>
      expect(screen.getByText(/次郎 があなたをフォローしました/)).toBeInTheDocument(),
    )
    expect(loadMoreNotifications).toHaveBeenCalledWith({
      filter: 'all',
      cursor: { createdAt: '2026-01-01T00:00:00Z', id: 'notif-1' },
    })
    // 続きが無くなったらボタンも消える
    expect(screen.queryByRole('button', { name: /もっと見る/ })).toBeNull()
  })

  it('未読が無ければ「すべて既読」は disabled', () => {
    render(
      <NotificationList
        initialPage={makePage({
          items: [
            {
              id: 'notif-1',
              type: 'like',
              entityType: 'post',
              entityId: 'post-1',
              readAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              actor: null,
              href: '/posts/post-1',
            },
          ],
        })}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage=""
      />,
    )

    expect(screen.getByRole('button', { name: 'すべて既読' })).toBeDisabled()
  })

  it('「すべて既読」を押すと全件が既読チップに変わる', async () => {
    render(
      <NotificationList
        initialPage={makePage()}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage=""
      />,
    )

    expect(screen.getByText('未読')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'すべて既読' }))

    await waitFor(() => expect(markAllNotificationsAsRead).toHaveBeenCalled())
    expect(screen.getByText('既読')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'すべて既読' })).toBeDisabled()
  })

  it('「すべて既読」が失敗したら未読チップとボタンの押下可能状態を元に戻す', async () => {
    markAllNotificationsAsRead.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    render(
      <NotificationList
        initialPage={makePage()}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage=""
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'すべて既読' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('未読')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'すべて既読' })).not.toBeDisabled()
  })

  it('個別クリックで既読化 Server Action が呼ばれる', async () => {
    render(
      <NotificationList
        initialPage={makePage()}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage=""
      />,
    )

    await userEvent.click(screen.getByRole('link'))

    await waitFor(() =>
      expect(markNotificationAsRead).toHaveBeenCalledWith({ notificationId: 'notif-1' }),
    )
  })

  it('個別既読化が失敗したら未読チップを元に戻す', async () => {
    markNotificationAsRead.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    render(
      <NotificationList
        initialPage={makePage()}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage=""
      />,
    )

    await userEvent.click(screen.getByRole('link'))

    await waitFor(() => expect(markNotificationAsRead).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('未読')).toBeInTheDocument())
  })

  it('片方の既読化が失敗しても、別の通知の既読化結果を上書きしない', async () => {
    markNotificationAsRead.mockImplementation(({ notificationId }: { notificationId: string }) =>
      Promise.resolve(
        notificationId === 'notif-1'
          ? { ok: false, error: 'INTERNAL_ERROR' }
          : { ok: true, data: null },
      ),
    )

    render(
      <NotificationList
        initialPage={makePage({
          items: [
            {
              id: 'notif-1',
              type: 'like',
              entityType: 'post',
              entityId: 'post-1',
              readAt: null,
              createdAt: new Date().toISOString(),
              actor: { id: 'actor-1', username: 'actor1', displayName: '太郎', avatarUrl: null },
              href: '/posts/post-1',
            },
            {
              id: 'notif-2',
              type: 'follow',
              entityType: 'user',
              entityId: 'actor-2',
              readAt: null,
              createdAt: new Date().toISOString(),
              actor: { id: 'actor-2', username: 'actor2', displayName: '次郎', avatarUrl: null },
              href: '/users/actor2',
            },
          ],
        })}
        filter="all"
        viewerId={viewerId}
        followingBackIds={new Set()}
        emptyMessage=""
      />,
    )

    await userEvent.click(screen.getByRole('link', { name: /いいねしました/ }))
    await userEvent.click(screen.getByRole('link', { name: /フォローしました/ }))

    await waitFor(() => expect(markNotificationAsRead).toHaveBeenCalledTimes(2))
    // notif-1 は失敗して未読に戻る。notif-2 は成功しており、notif-1 のロールバックで
    // 上書きされず既読のままであること（配列全体ではなく id 指定で戻す）を確認する
    await waitFor(() => expect(screen.getAllByText('未読')).toHaveLength(1))
    expect(screen.getAllByText('既読')).toHaveLength(1)
  })
})
