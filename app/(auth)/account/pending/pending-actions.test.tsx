import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingActions } from './pending-actions'

const refreshConsentStatus = vi.fn()
const resendGuardianConsentEmail = vi.fn()
const updateGuardianEmail = vi.fn()
const push = vi.fn()
const refresh = vi.fn()

vi.mock('@/app/_actions/auth', () => ({
  refreshConsentStatus: () => refreshConsentStatus(),
  resendGuardianConsentEmail: () => resendGuardianConsentEmail(),
  updateGuardianEmail: (email: string) => updateGuardianEmail(email),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

beforeEach(() => {
  refreshConsentStatus.mockReset()
  resendGuardianConsentEmail.mockReset()
  updateGuardianEmail.mockReset()
  push.mockReset()
  refresh.mockReset()
})

describe('PendingActions', () => {
  it('状態確認でまだ pending_consent なら案内メッセージを出し遷移しない', async () => {
    const user = userEvent.setup()
    refreshConsentStatus.mockResolvedValue({ ok: true, data: { status: 'pending_consent' } })
    render(<PendingActions />)

    await user.click(screen.getByRole('button', { name: '状態を確認する' }))

    await waitFor(() =>
      expect(
        screen.getByText(
          'まだ保護者の同意が確認できていません。しばらくしてから再度お試しください',
        ),
      ).toBeInTheDocument(),
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('状態確認で pending_consent から変わっていれば / へ遷移する', async () => {
    const user = userEvent.setup()
    refreshConsentStatus.mockResolvedValue({ ok: true, data: { status: 'active' } })
    render(<PendingActions />)

    await user.click(screen.getByRole('button', { name: '状態を確認する' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(refresh).toHaveBeenCalled()
  })

  it('refreshSession失敗などでrefreshConsentStatusがエラーを返したら、遷移せずエラーを表示する', async () => {
    const user = userEvent.setup()
    refreshConsentStatus.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    render(<PendingActions />)

    await user.click(screen.getByRole('button', { name: '状態を確認する' }))

    await waitFor(() =>
      expect(
        screen.getByText('エラーが発生しました。時間をおいて再試行してください'),
      ).toBeInTheDocument(),
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('再送に成功したらメッセージを出す', async () => {
    const user = userEvent.setup()
    resendGuardianConsentEmail.mockResolvedValue({ ok: true, data: null })
    render(<PendingActions />)

    await user.click(screen.getByRole('button', { name: '再送する' }))

    await waitFor(() => expect(screen.getByText('確認メールを再送しました')).toBeInTheDocument())
  })

  it('再送が失敗したらエラーを表示する', async () => {
    const user = userEvent.setup()
    resendGuardianConsentEmail.mockResolvedValue({ ok: false, error: 'RATE_LIMITED' })
    render(<PendingActions />)

    await user.click(screen.getByRole('button', { name: '再送する' }))

    await waitFor(() =>
      expect(screen.getByText('しばらく待ってから再試行してください')).toBeInTheDocument(),
    )
  })

  it('メールアドレス変更に成功したらフォームを閉じてメッセージを出す', async () => {
    const user = userEvent.setup()
    updateGuardianEmail.mockResolvedValue({ ok: true, data: null })
    render(<PendingActions />)

    await user.click(screen.getByRole('button', { name: 'メールアドレスを変更' }))
    await user.type(screen.getByLabelText('新しい保護者のメールアドレス'), 'guardian2@example.com')
    await user.click(screen.getByRole('button', { name: '送信する' }))

    expect(updateGuardianEmail).toHaveBeenCalledWith('guardian2@example.com')
    await waitFor(() =>
      expect(
        screen.getByText('新しいメールアドレスに確認メールを送信しました'),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByLabelText('新しい保護者のメールアドレス')).not.toBeInTheDocument()
  })
})
