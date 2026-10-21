import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportReviewActions } from './report-review-actions'

const resolveReport = vi.fn()

vi.mock('@/app/_actions/admin-reports', () => ({
  resolveReport: (input: unknown) => resolveReport(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const reportId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  resolveReport.mockReset()
  resolveReport.mockResolvedValue({ ok: true, data: { reportId } })
})

describe('ReportReviewActions', () => {
  it('送信中も確認ボタンを disabled にしない（D60）', async () => {
    resolveReport.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<ReportReviewActions reportId={reportId} targetType="post" />)

    await user.click(screen.getByRole('button', { name: '投稿を非表示にする' }))
    await user.click(screen.getByRole('button', { name: '実行する' }))

    const confirmButton = screen.getByRole('button', { name: '実行する' })
    await waitFor(() => expect(confirmButton).toHaveAttribute('aria-busy', 'true'))
    expect(confirmButton).not.toBeDisabled()
  })

  it('targetType=cafe では「カフェを非表示にする」と「却下」のみ表示する（D40）', () => {
    render(<ReportReviewActions reportId={reportId} targetType="cafe" />)

    expect(screen.getByRole('button', { name: 'カフェを非表示にする' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '違反なし（却下）' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '投稿を非表示にする' })).not.toBeInTheDocument()
  })

  it('送信中の連打では2回目を送らない', async () => {
    resolveReport.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<ReportReviewActions reportId={reportId} targetType="post" />)

    await user.click(screen.getByRole('button', { name: '投稿を非表示にする' }))
    const confirmButton = screen.getByRole('button', { name: '実行する' })
    await user.click(confirmButton)
    await user.click(confirmButton)

    expect(resolveReport).toHaveBeenCalledTimes(1)
  })
})
