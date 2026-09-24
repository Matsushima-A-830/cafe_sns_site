import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OwnerVerificationReviewActions } from './owner-verification-review-actions'

const resolveOwnerVerification = vi.fn()

vi.mock('@/app/_actions/admin-owner-verifications', () => ({
  resolveOwnerVerification: (input: unknown) => resolveOwnerVerification(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const verificationId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  resolveOwnerVerification.mockReset()
  resolveOwnerVerification.mockResolvedValue({ ok: true, data: { verificationId } })
})

describe('OwnerVerificationReviewActions', () => {
  it('送信中も判定ボタンを disabled にしない（D60）', async () => {
    resolveOwnerVerification.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<OwnerVerificationReviewActions verificationId={verificationId} />)

    await user.click(screen.getByRole('button', { name: '承認する' }))
    await user.click(screen.getByRole('button', { name: '実行する' }))

    const confirmButton = screen.getByRole('button', { name: '実行する' })
    await waitFor(() => expect(confirmButton).toHaveAttribute('aria-busy', 'true'))
    expect(confirmButton).not.toBeDisabled()
  })

  it('送信中の連打では2回目を送らない', async () => {
    resolveOwnerVerification.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<OwnerVerificationReviewActions verificationId={verificationId} />)

    await user.click(screen.getByRole('button', { name: '承認する' }))
    const confirmButton = screen.getByRole('button', { name: '実行する' })
    await user.click(confirmButton)
    await user.click(confirmButton)

    expect(resolveOwnerVerification).toHaveBeenCalledTimes(1)
  })

  it('却下理由が空だと確認ボタンは disabled のまま（バリデーション由来はそのまま無効化する）', async () => {
    const user = userEvent.setup()
    render(<OwnerVerificationReviewActions verificationId={verificationId} />)

    await user.click(screen.getByRole('button', { name: '却下する' }))

    expect(screen.getByRole('button', { name: '実行する' })).toBeDisabled()
  })
})
