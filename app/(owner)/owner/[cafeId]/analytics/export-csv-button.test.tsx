import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportCsvButton } from './export-csv-button'

const exportCafeAnalyticsCsv = vi.fn()

vi.mock('@/app/_actions/owner-analytics', () => ({
  exportCafeAnalyticsCsv: (input: unknown) => exportCafeAnalyticsCsv(input),
}))

const cafeId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  exportCafeAnalyticsCsv.mockReset()
  exportCafeAnalyticsCsv.mockResolvedValue({
    ok: true,
    data: { csv: 'header\nrow', filename: 'analytics.csv' },
  })
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
})

describe('ExportCsvButton', () => {
  it('送信中もボタンを disabled にしない（D60）', async () => {
    exportCafeAnalyticsCsv.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<ExportCsvButton cafeId={cafeId} weeks={12} />)

    await user.click(screen.getByRole('button', { name: 'CSVでダウンロード' }))

    const button = screen.getByRole('button', { name: 'ダウンロード準備中…' })
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    expect(button).not.toBeDisabled()
  })

  it('送信中の連打では2回目を送らない', async () => {
    exportCafeAnalyticsCsv.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<ExportCsvButton cafeId={cafeId} weeks={12} />)

    const button = screen.getByRole('button', { name: 'CSVでダウンロード' })
    await user.click(button)
    await user.click(button)

    expect(exportCafeAnalyticsCsv).toHaveBeenCalledTimes(1)
  })

  it('成功するとCSVをダウンロードする', async () => {
    const user = userEvent.setup()
    render(<ExportCsvButton cafeId={cafeId} weeks={12} />)

    await user.click(screen.getByRole('button', { name: 'CSVでダウンロード' }))

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    expect(exportCafeAnalyticsCsv).toHaveBeenCalledWith({ cafeId, weeks: 12 })
  })
})
