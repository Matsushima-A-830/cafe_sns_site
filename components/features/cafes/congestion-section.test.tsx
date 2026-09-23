import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CongestionSummary } from '@/lib/cafes/congestion'
import { CongestionSection } from './congestion-section'

const reportCongestion = vi.fn()

vi.mock('@/app/_actions/congestion', () => ({
  reportCongestion: (input: unknown) => reportCongestion(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const cafeId = '11111111-1111-4111-8111-111111111111'

const historical: CongestionSummary = { source: 'historical', levelAvg: 2, sampleCount: 12 }
const recent: CongestionSummary = { source: 'recent', levelAvg: 3, sampleCount: 2 }

beforeEach(() => {
  reportCongestion.mockReset()
})

describe('CongestionSection', () => {
  it('過去データの状態から報告しても、件数を引き継がない', async () => {
    // 返さないまま保留して楽観更新の表示だけを見る
    reportCongestion.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CongestionSection cafeId={cafeId} initialSummary={historical} isAuthenticated={true} />)
    expect(screen.getByText('過去4週間の同じ時間帯 12件より')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '混んでいる' }))

    // 12 + 1 にすると「直近30分に13件」という嘘になる
    expect(screen.getByText('直近30分のレポート 1件')).toBeInTheDocument()
  })

  it('直近30分の状態からは件数を1つ足す', async () => {
    reportCongestion.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CongestionSection cafeId={cafeId} initialSummary={recent} isAuthenticated={true} />)
    await user.click(screen.getByRole('button', { name: '空いている' }))

    expect(screen.getByText('直近30分のレポート 3件')).toBeInTheDocument()
  })

  // disabled にするとその瞬間にフォーカスが body へ落ち、キーボードのユーザーは
  // 押すたびにページ先頭から辿り直すことになる
  it('送信中もボタンを無効化せず、フォーカスを保つ', async () => {
    reportCongestion.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CongestionSection cafeId={cafeId} initialSummary={recent} isAuthenticated={true} />)
    await user.click(screen.getByRole('button', { name: '空いている' }))

    const button = screen.getByRole('button', { name: '空いている' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveFocus()
  })

  it('送信中の連打は追加のリクエストを起こさない', async () => {
    reportCongestion.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CongestionSection cafeId={cafeId} initialSummary={recent} isAuthenticated={true} />)
    await user.click(screen.getByRole('button', { name: '空いている' }))
    await user.click(screen.getByRole('button', { name: '混んでいる' }))
    await user.click(screen.getByRole('button', { name: '普通' }))

    expect(reportCongestion).toHaveBeenCalledTimes(1)
  })

  it('失敗したら元の集計に戻し、エラーを伝える', async () => {
    reportCongestion.mockResolvedValue({ ok: false, error: 'FORBIDDEN' })
    const user = userEvent.setup()

    render(<CongestionSection cafeId={cafeId} initialSummary={historical} isAuthenticated={true} />)
    await user.click(screen.getByRole('button', { name: '普通' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('この操作を行う権限がありません')
    })
    expect(screen.getByText('過去4週間の同じ時間帯 12件より')).toBeInTheDocument()
  })

  it('未ログインには報告ボタンではなくログイン導線を出す', () => {
    render(
      <CongestionSection cafeId={cafeId} initialSummary={historical} isAuthenticated={false} />,
    )

    expect(screen.queryByRole('button', { name: '普通' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ログイン' })).toHaveAttribute(
      'href',
      `/login?next=%2Fcafes%2F${cafeId}`,
    )
  })
})
