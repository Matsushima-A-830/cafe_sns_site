import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportForm } from './report-form'

const createReport = vi.fn()
const blockUser = vi.fn()

vi.mock('@/app/_actions/reports', () => ({
  createReport: (input: unknown) => createReport(input),
}))
vi.mock('@/app/_actions/blocks', () => ({
  blockUser: (input: unknown) => blockUser(input),
}))

const targetId = '11111111-1111-4111-8111-111111111111'

function setup(props: Partial<Parameters<typeof ReportForm>[0]> = {}) {
  render(
    <ReportForm
      targetType="post"
      targetId={targetId}
      targetLabel="テスト投稿"
      backHref="/posts/1"
      {...props}
    />,
  )
}

beforeEach(() => {
  createReport.mockReset()
  blockUser.mockReset()
})

describe('ReportForm', () => {
  it('理由未選択では送信ボタンが disabled', () => {
    setup()

    expect(screen.getByRole('button', { name: '通報する' })).toBeDisabled()
  })

  it('理由を選ぶと送信でき、成功したら完了画面に切り替わる', async () => {
    const user = userEvent.setup()
    createReport.mockResolvedValue({ ok: true, data: { blockableUserId: null } })
    setup()

    await user.click(screen.getByLabelText('スパム / 宣伝'))
    await user.click(screen.getByRole('button', { name: '通報する' }))

    await waitFor(() =>
      expect(createReport).toHaveBeenCalledWith({
        targetType: 'post',
        targetId,
        reason: 'spam',
        description: undefined,
      }),
    )
    await waitFor(() => expect(screen.getByText('通報を受け付けました')).toBeInTheDocument())
  })

  it('失敗したらエラーを表示し完了画面には切り替わらない', async () => {
    const user = userEvent.setup()
    createReport.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    setup()

    await user.click(screen.getByLabelText('嫌がらせ / 誹謗中傷'))
    await user.click(screen.getByRole('button', { name: '通報する' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText('通報を受け付けました')).toBeNull()
  })

  it('送信中も disabled にしない（フォーカスを body へ落とさない — D60）', async () => {
    const user = userEvent.setup()
    createReport.mockImplementation(() => new Promise(() => {}))
    setup()

    await user.click(screen.getByLabelText('その他'))
    const submit = screen.getByRole('button', { name: '通報する' })
    await user.click(submit)

    await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'))
    expect(submit).not.toBeDisabled()
  })

  it('送信中の連打では createReport を2回送らない', async () => {
    const user = userEvent.setup()
    createReport.mockImplementation(() => new Promise(() => {}))
    setup()

    await user.click(screen.getByLabelText('その他'))
    const submit = screen.getByRole('button', { name: '通報する' })
    await user.click(submit)
    await user.click(submit)

    expect(createReport).toHaveBeenCalledTimes(1)
  })

  it('ブロック可能なユーザーが返れば完了画面でブロック導線を出し、連打では blockUser を2回送らない', async () => {
    const user = userEvent.setup()
    const blockableUserId = '22222222-2222-4222-8222-222222222222'
    createReport.mockResolvedValue({ ok: true, data: { blockableUserId } })
    blockUser.mockImplementation(() => new Promise(() => {}))
    setup()

    await user.click(screen.getByLabelText('スパム / 宣伝'))
    await user.click(screen.getByRole('button', { name: '通報する' }))
    await waitFor(() =>
      expect(screen.getByText('該当ユーザーをブロックしますか？')).toBeInTheDocument(),
    )

    const blockButton = screen.getByRole('button', { name: 'ブロックする' })
    await user.click(blockButton)
    await user.click(blockButton)

    await waitFor(() => expect(blockButton).toHaveAttribute('aria-busy', 'true'))
    expect(blockButton).not.toBeDisabled()
    expect(blockUser).toHaveBeenCalledTimes(1)
  })
})
