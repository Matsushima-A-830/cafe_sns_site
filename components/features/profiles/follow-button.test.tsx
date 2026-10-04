import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FollowButton } from './follow-button'

const followUser = vi.fn()
const unfollowUser = vi.fn()

vi.mock('@/app/_actions/follows', () => ({
  followUser: (input: unknown) => followUser(input),
  unfollowUser: (input: unknown) => unfollowUser(input),
}))

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

const followeeId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  followUser.mockReset()
  unfollowUser.mockReset()
  refresh.mockReset()
})

describe('FollowButton', () => {
  it('押した瞬間にラベルが変わる（楽観更新）', async () => {
    followUser.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<FollowButton followeeId={followeeId} initialFollowing={false} />)
    await user.click(screen.getByRole('button', { name: 'フォロー' }))

    expect(screen.getByRole('button', { name: 'フォロー中' })).toBeInTheDocument()
  })

  // disabled にするとその瞬間にフォーカスが body へ落ち、キーボードのユーザーは
  // 押すたびにページ先頭から辿り直すことになる
  it('送信中もボタンを無効化せず、フォーカスを保つ', async () => {
    followUser.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<FollowButton followeeId={followeeId} initialFollowing={false} />)
    await user.click(screen.getByRole('button', { name: 'フォロー' }))

    const button = screen.getByRole('button', { name: 'フォロー中' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveFocus()
  })

  it('送信中の連打は追加のリクエストを起こさない', async () => {
    followUser.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<FollowButton followeeId={followeeId} initialFollowing={false} />)
    await user.click(screen.getByRole('button', { name: 'フォロー' }))
    await user.click(screen.getByRole('button', { name: 'フォロー中' }))
    await user.click(screen.getByRole('button', { name: 'フォロー中' }))

    expect(followUser).toHaveBeenCalledTimes(1)
    expect(unfollowUser).not.toHaveBeenCalled()
  })

  it('フォロー中なら解除を呼ぶ', async () => {
    unfollowUser.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()

    render(<FollowButton followeeId={followeeId} initialFollowing={true} />)
    await user.click(screen.getByRole('button', { name: 'フォロー中' }))

    await waitFor(() => expect(unfollowUser).toHaveBeenCalledWith({ followeeId }))
  })

  it('ALREADY_FOLLOWING は成功として扱う', async () => {
    followUser.mockResolvedValue({ ok: false, error: 'ALREADY_FOLLOWING' })
    const user = userEvent.setup()

    render(<FollowButton followeeId={followeeId} initialFollowing={false} />)
    await user.click(screen.getByRole('button', { name: 'フォロー' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'フォロー中' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // D37: refresh() を startTransition の外（useDeferredRefresh）で呼ぶことで、
  // isPending は書き込み完了だけで false に戻る。実際のタイミング保証は
  // lib/utils/use-deferred-refresh.test.ts でフック単体を検証する
  it('書き込み成功後に refresh() する', async () => {
    unfollowUser.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()

    render(<FollowButton followeeId={followeeId} initialFollowing={true} />)
    await user.click(screen.getByRole('button', { name: 'フォロー中' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('失敗したら元の状態に戻し、理由を伝える', async () => {
    followUser.mockResolvedValue({ ok: false, error: 'FORBIDDEN' })
    const user = userEvent.setup()

    render(<FollowButton followeeId={followeeId} initialFollowing={false} />)
    await user.click(screen.getByRole('button', { name: 'フォロー' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('この操作を行う権限がありません')
    })
    expect(screen.getByRole('button', { name: 'フォロー' })).toBeInTheDocument()
  })
})
