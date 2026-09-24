import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlockedUser } from '@/app/_actions/blocks'
import { BlockedUserList } from './blocked-user-list'

const unblockUser = vi.fn()

vi.mock('@/app/_actions/blocks', async () => {
  const actual =
    await vi.importActual<typeof import('@/app/_actions/blocks')>('@/app/_actions/blocks')
  return {
    ...actual,
    unblockUser: (input: unknown) => unblockUser(input),
  }
})

const users: BlockedUser[] = [
  { id: 'u1', username: 'user1', displayName: 'ユーザー1', avatarUrl: null },
]

const twoUsers: BlockedUser[] = [
  ...users,
  { id: 'u2', username: 'user2', displayName: 'ユーザー2', avatarUrl: null },
]

beforeEach(() => {
  unblockUser.mockReset()
})

describe('BlockedUserList', () => {
  it('確認ダイアログを経てから unblockUser を呼ぶ', async () => {
    const user = userEvent.setup()
    unblockUser.mockResolvedValue({ ok: true, data: null })
    render(<BlockedUserList initialUsers={users} />)

    await user.click(screen.getByRole('button', { name: '解除' }))
    expect(unblockUser).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '解除する' }))

    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith({ targetUserId: 'u1' }))
  })

  it('失敗したら一覧を元に戻しエラーを表示する', async () => {
    const user = userEvent.setup()
    unblockUser.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    render(<BlockedUserList initialUsers={users} />)

    await user.click(screen.getByRole('button', { name: '解除' }))
    await user.click(screen.getByRole('button', { name: '解除する' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('ユーザー1')).toBeInTheDocument()
  })

  it('送信中も disabled にしない（フォーカスを body へ落とさない — D60）', async () => {
    const user = userEvent.setup()
    unblockUser.mockImplementation(() => new Promise(() => {}))
    // 解除対象は楽観更新で一覧から消えるため、別のユーザーの「解除」ボタンで aria-busy を確認する
    render(<BlockedUserList initialUsers={twoUsers} />)

    await user.click(screen.getAllByRole('button', { name: '解除' })[0] as HTMLElement)
    await user.click(screen.getByRole('button', { name: '解除する' }))

    const remainingButton = screen.getByRole('button', { name: '解除' })
    await waitFor(() => expect(remainingButton).toHaveAttribute('aria-busy', 'true'))
    expect(remainingButton).not.toBeDisabled()
  })

  it('送信中に再度ダイアログを開いて確定しても unblockUser を2回送らない', async () => {
    const user = userEvent.setup()
    unblockUser.mockImplementation(() => new Promise(() => {}))
    render(<BlockedUserList initialUsers={twoUsers} />)

    await user.click(screen.getAllByRole('button', { name: '解除' })[0] as HTMLElement)
    await user.click(screen.getByRole('button', { name: '解除する' }))

    // 楽観更新で u1 は一覧から消えているため、残る解除ボタンは u2 のもの
    await user.click(screen.getByRole('button', { name: '解除' }))
    await user.click(screen.getByRole('button', { name: '解除する' }))

    expect(unblockUser).toHaveBeenCalledTimes(1)
    expect(unblockUser).toHaveBeenCalledWith({ targetUserId: 'u1' })
  })
})
