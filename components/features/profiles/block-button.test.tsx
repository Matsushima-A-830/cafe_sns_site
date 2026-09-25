import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockButton } from './block-button'

const blockUser = vi.fn()
const push = vi.fn()

vi.mock('@/app/_actions/blocks', () => ({
  blockUser: (input: unknown) => blockUser(input),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const targetUserId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  blockUser.mockReset()
  push.mockReset()
})

describe('BlockButton', () => {
  it('確認ダイアログを経てから blockUser を呼び、成功したらホームへ遷移する', async () => {
    const user = userEvent.setup()
    blockUser.mockResolvedValue({ ok: true, data: null })
    render(<BlockButton targetUserId={targetUserId} />)

    await user.click(screen.getByRole('button', { name: 'ブロック' }))
    expect(blockUser).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'ブロックする' }))

    await waitFor(() => expect(blockUser).toHaveBeenCalledWith({ targetUserId }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('失敗したらエラーを表示し遷移しない', async () => {
    const user = userEvent.setup()
    blockUser.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    render(<BlockButton targetUserId={targetUserId} />)

    await user.click(screen.getByRole('button', { name: 'ブロック' }))
    await user.click(screen.getByRole('button', { name: 'ブロックする' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(push).not.toHaveBeenCalled()
  })

  it('送信中も disabled にしない（フォーカスを body へ落とさない — D60）', async () => {
    const user = userEvent.setup()
    blockUser.mockImplementation(() => new Promise(() => {}))
    render(<BlockButton targetUserId={targetUserId} />)

    await user.click(screen.getByRole('button', { name: 'ブロック' }))
    const confirmButton = screen.getByRole('button', { name: 'ブロックする' })
    await user.click(confirmButton)

    await waitFor(() => expect(confirmButton).toHaveAttribute('aria-busy', 'true'))
    expect(confirmButton).not.toBeDisabled()
  })

  it('送信中の連打では blockUser を2回送らない', async () => {
    const user = userEvent.setup()
    blockUser.mockImplementation(() => new Promise(() => {}))
    render(<BlockButton targetUserId={targetUserId} />)

    await user.click(screen.getByRole('button', { name: 'ブロック' }))
    const confirmButton = screen.getByRole('button', { name: 'ブロックする' })
    await user.click(confirmButton)
    await user.click(confirmButton)

    expect(blockUser).toHaveBeenCalledTimes(1)
  })
})
