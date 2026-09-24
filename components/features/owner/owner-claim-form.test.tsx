import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OwnerClaimForm } from './owner-claim-form'

const claimCafe = vi.fn()
const uploadOwnerDocument = vi.fn()
const deleteOwnerDocumentFile = vi.fn()
const push = vi.fn()

vi.mock('@/app/_actions/owner', () => ({
  claimCafe: (input: unknown) => claimCafe(input),
}))
vi.mock('@/lib/storage/owner-document-client', () => ({
  uploadOwnerDocument: (verificationId: string, file: File) =>
    uploadOwnerDocument(verificationId, file),
  deleteOwnerDocumentFile: (path: string) => deleteOwnerDocumentFile(path),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const cafeId = '11111111-1111-4111-8111-111111111111'

function file(name: string) {
  return new File(['x'], name, { type: 'application/pdf' })
}

function setup(props: Partial<Parameters<typeof OwnerClaimForm>[0]> = {}) {
  render(
    <OwnerClaimForm cafeId={cafeId} cafeName="テストカフェ" rejectedReason={null} {...props} />,
  )
}

async function uploadDocument(
  user: ReturnType<typeof userEvent.setup>,
  buttonIndex = 0,
  fileName = 'a.pdf',
) {
  const buttons = screen.getAllByRole('button', { name: '＋ アップロード' })
  const inputs = document.querySelectorAll('input[type="file"]')
  await user.upload(inputs[buttonIndex] as HTMLInputElement, file(fileName))
  return buttons
}

beforeEach(() => {
  claimCafe.mockReset()
  uploadOwnerDocument.mockReset()
  deleteOwnerDocumentFile.mockReset()
  push.mockReset()
  uploadOwnerDocument.mockResolvedValue({ ok: true, data: { path: 'user/verification/a.pdf' } })
  deleteOwnerDocumentFile.mockResolvedValue({ ok: true, data: null })
})

describe('OwnerClaimForm', () => {
  it('初期状態では送信ボタンが disabled で「2点未選択」の注意書きが出る', () => {
    setup()

    expect(screen.getByRole('button', { name: '申請を送信する' })).toBeDisabled()
    expect(screen.getByText('※ 2点未選択の場合は送信不可')).toBeInTheDocument()
    expect(screen.getByText('選択済み: 0 / 2 必要')).toBeInTheDocument()
  })

  it('書類2点未満・連絡先メール未入力・確認チェック未了では送信できない', async () => {
    const user = userEvent.setup()
    setup()

    await uploadDocument(user, 0, 'license.pdf')
    expect(screen.getByText('選択済み: 1 / 2 必要')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '申請を送信する' })).toBeDisabled()
  })

  it('書類2点・メール・3チェックが揃うと送信でき、成功時は /owner/pending へ遷移する', async () => {
    const user = userEvent.setup()
    claimCafe.mockResolvedValue({ ok: true, data: { verificationId: 'v1' } })
    setup()

    await uploadDocument(user, 0, 'license.pdf')
    await uploadDocument(user, 2, 'registry.pdf')
    expect(screen.getByText('選択済み: 2 / 2 必要')).toBeInTheDocument()

    await user.type(screen.getByLabelText('連絡先メール'), 'owner@example.com')
    await user.click(screen.getByLabelText('提出情報は本人のものです'))
    await user.click(screen.getByLabelText('審査結果に従います'))
    await user.click(
      screen.getByLabelText('運営から追加確認の連絡がある場合があることを理解しました'),
    )

    const submit = screen.getByRole('button', { name: '申請を送信する' })
    expect(submit).not.toBeDisabled()
    await user.click(submit)

    await waitFor(() => expect(claimCafe).toHaveBeenCalled())
    expect(claimCafe).toHaveBeenCalledWith(
      expect.objectContaining({
        cafeId,
        contactEmail: 'owner@example.com',
        documents: [
          { type: 'business_license', path: 'user/verification/a.pdf' },
          { type: 'corporate_registry', path: 'user/verification/a.pdf' },
        ],
      }),
    )
    await waitFor(() => expect(push).toHaveBeenCalledWith('/owner/pending'))
  })

  it('claimCafe が失敗したらエラーメッセージを表示し遷移しない', async () => {
    const user = userEvent.setup()
    claimCafe.mockResolvedValue({ ok: false, error: 'VERIFICATION_ALREADY_PENDING' })
    setup()

    await uploadDocument(user, 0, 'license.pdf')
    await uploadDocument(user, 2, 'registry.pdf')
    await user.type(screen.getByLabelText('連絡先メール'), 'owner@example.com')
    await user.click(screen.getByLabelText('提出情報は本人のものです'))
    await user.click(screen.getByLabelText('審査結果に従います'))
    await user.click(
      screen.getByLabelText('運営から追加確認の連絡がある場合があることを理解しました'),
    )
    await user.click(screen.getByRole('button', { name: '申請を送信する' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('このカフェへの申請は既に審査中です'),
    )
    expect(push).not.toHaveBeenCalled()
  })

  it('アップロード失敗時（サイズ超過）はファイル向けの文言でエラーを表示し、書類は追加しない', async () => {
    const user = userEvent.setup()
    uploadOwnerDocument.mockResolvedValue({ ok: false, error: 'FILE_TOO_LARGE' })
    setup()

    await uploadDocument(user, 0, 'huge.pdf')

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('ファイルのサイズが大きすぎます'),
    )
    expect(screen.getByText('選択済み: 0 / 2 必要')).toBeInTheDocument()
  })

  it('削除ボタンは書類を一覧から外し、Storage 側の削除も呼ぶ（孤立ファイル防止）', async () => {
    const user = userEvent.setup()
    setup()

    await uploadDocument(user, 0, 'license.pdf')
    expect(screen.getByText('選択済み: 1 / 2 必要')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '削除' }))

    expect(screen.getByText('選択済み: 0 / 2 必要')).toBeInTheDocument()
    await waitFor(() =>
      expect(deleteOwnerDocumentFile).toHaveBeenCalledWith('user/verification/a.pdf'),
    )
  })

  it('却下理由が渡されればバナーに表示する', () => {
    setup({ rejectedReason: '書類の氏名が一致しません' })

    expect(screen.getByText('前回の申請は却下されています')).toBeInTheDocument()
    expect(screen.getByText('理由: 書類の氏名が一致しません')).toBeInTheDocument()
  })

  it('送信中も disabled にしない（フォーカスを body へ落とさない — D60）', async () => {
    const user = userEvent.setup()
    claimCafe.mockImplementation(() => new Promise(() => {}))
    setup()

    await uploadDocument(user, 0, 'license.pdf')
    await uploadDocument(user, 2, 'registry.pdf')
    await user.type(screen.getByLabelText('連絡先メール'), 'owner@example.com')
    await user.click(screen.getByLabelText('提出情報は本人のものです'))
    await user.click(screen.getByLabelText('審査結果に従います'))
    await user.click(
      screen.getByLabelText('運営から追加確認の連絡がある場合があることを理解しました'),
    )

    const submit = screen.getByRole('button', { name: '申請を送信する' })
    await user.click(submit)

    await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'))
    expect(submit).not.toBeDisabled()
  })

  it('送信中の連打では claimCafe を2回送らない', async () => {
    const user = userEvent.setup()
    claimCafe.mockImplementation(() => new Promise(() => {}))
    setup()

    await uploadDocument(user, 0, 'license.pdf')
    await uploadDocument(user, 2, 'registry.pdf')
    await user.type(screen.getByLabelText('連絡先メール'), 'owner@example.com')
    await user.click(screen.getByLabelText('提出情報は本人のものです'))
    await user.click(screen.getByLabelText('審査結果に従います'))
    await user.click(
      screen.getByLabelText('運営から追加確認の連絡がある場合があることを理解しました'),
    )

    const submit = screen.getByRole('button', { name: '申請を送信する' })
    await user.click(submit)
    await user.click(submit)

    expect(claimCafe).toHaveBeenCalledTimes(1)
  })

  it('送信中は削除ボタンを押しても書類を消さない（送信済みパスの不整合防止 — D60）', async () => {
    const user = userEvent.setup()
    claimCafe.mockImplementation(() => new Promise(() => {}))
    setup()

    await uploadDocument(user, 0, 'license.pdf')
    await uploadDocument(user, 2, 'registry.pdf')
    await user.type(screen.getByLabelText('連絡先メール'), 'owner@example.com')
    await user.click(screen.getByLabelText('提出情報は本人のものです'))
    await user.click(screen.getByLabelText('審査結果に従います'))
    await user.click(
      screen.getByLabelText('運営から追加確認の連絡がある場合があることを理解しました'),
    )
    await user.click(screen.getByRole('button', { name: '申請を送信する' }))

    await waitFor(() => expect(claimCafe).toHaveBeenCalled())
    deleteOwnerDocumentFile.mockClear()

    await user.click(screen.getAllByRole('button', { name: '削除' })[0] as HTMLElement)

    expect(screen.getByText('選択済み: 2 / 2 必要')).toBeInTheDocument()
    expect(deleteOwnerDocumentFile).not.toHaveBeenCalled()
  })
})
