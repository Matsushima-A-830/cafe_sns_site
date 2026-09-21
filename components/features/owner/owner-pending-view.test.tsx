import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OwnerVerificationWithCafe } from '@/lib/owner/verification'
import { OwnerPendingView } from './owner-pending-view'

const withdrawClaim = vi.fn()

vi.mock('@/app/_actions/owner', () => ({
  withdrawClaim: (input: unknown) => withdrawClaim(input),
}))

const base: OwnerVerificationWithCafe = {
  id: 'v1',
  cafeId: 'c1',
  status: 'pending',
  reviewNotes: null,
  createdAt: '2026-09-01T00:00:00Z',
  reviewedAt: null,
  cafe: { id: 'c1', name: 'テストカフェ', areaLabel: '渋谷区' },
}

beforeEach(() => {
  withdrawClaim.mockReset()
})

describe('OwnerPendingView', () => {
  it('pending なら審査中の案内と取り下げボタンを出す', () => {
    render(<OwnerPendingView verification={base} />)

    expect(screen.getByText('審査中です')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '申請を取り下げる' })).toBeInTheDocument()
  })

  it('rejected なら理由と再申請リンクを出す', () => {
    render(
      <OwnerPendingView
        verification={{ ...base, status: 'rejected', reviewNotes: '書類が不足しています' }}
      />,
    )

    expect(screen.getByText('申請が却下されました')).toBeInTheDocument()
    expect(screen.getByText('理由: 書類が不足しています')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '再申請する' })).toHaveAttribute(
      'href',
      '/owner/claim/c1',
    )
  })

  it('取り下げは確認ダイアログを経てから実行される', async () => {
    const user = userEvent.setup()
    withdrawClaim.mockResolvedValue({ ok: true, data: null })
    render(<OwnerPendingView verification={base} />)

    await user.click(screen.getByRole('button', { name: '申請を取り下げる' }))
    expect(withdrawClaim).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '取り下げる' }))

    await waitFor(() => expect(withdrawClaim).toHaveBeenCalledWith({ verificationId: 'v1' }))
    await waitFor(() => expect(screen.getByText('申請を取り下げました')).toBeInTheDocument())
  })

  it('取り下げ失敗時はエラーメッセージを表示し状態を変えない', async () => {
    const user = userEvent.setup()
    withdrawClaim.mockResolvedValue({ ok: false, error: 'NOT_FOUND' })
    render(<OwnerPendingView verification={base} />)

    await user.click(screen.getByRole('button', { name: '申請を取り下げる' }))
    await user.click(screen.getByRole('button', { name: '取り下げる' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('対象が見つかりませんでした'),
    )
    expect(screen.getByText('審査中です')).toBeInTheDocument()
  })
})
