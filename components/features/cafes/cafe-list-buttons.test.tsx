import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeListButtons } from './cafe-list-buttons'

const addCafeToList = vi.fn()
const removeCafeFromList = vi.fn()

vi.mock('@/app/_actions/cafe-lists', () => ({
  addCafeToList: (input: unknown) => addCafeToList(input),
  removeCafeFromList: (input: unknown) => removeCafeFromList(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const cafeId = '11111111-1111-4111-8111-111111111111'
const none = { favorite: false, want_to_go: false }

beforeEach(() => {
  addCafeToList.mockReset()
  removeCafeFromList.mockReset()
})

describe('CafeListButtons', () => {
  it('押した瞬間にラベルと押下状態が変わる（楽観更新）', async () => {
    addCafeToList.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CafeListButtons cafeId={cafeId} membership={none} isAuthenticated={true} />)
    const button = screen.getByRole('button', { name: 'お気に入り' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(button)

    // 色だけでなくラベルと aria-pressed でも状態が分かること
    const pressed = screen.getByRole('button', { name: 'お気に入り済み' })
    expect(pressed).toHaveAttribute('aria-pressed', 'true')
  })

  // disabled にするとその瞬間にフォーカスが body へ落ち、キーボードのユーザーは
  // 押すたびにページ先頭から辿り直すことになる
  it('送信中もボタンを無効化せず、フォーカスを保つ', async () => {
    addCafeToList.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CafeListButtons cafeId={cafeId} membership={none} isAuthenticated={true} />)
    await user.click(screen.getByRole('button', { name: 'お気に入り' }))

    const button = screen.getByRole('button', { name: 'お気に入り済み' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveFocus()
  })

  it('送信中の連打は追加のリクエストを起こさない', async () => {
    addCafeToList.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CafeListButtons cafeId={cafeId} membership={none} isAuthenticated={true} />)
    await user.click(screen.getByRole('button', { name: 'お気に入り' }))
    await user.click(screen.getByRole('button', { name: 'お気に入り済み' }))
    await user.click(screen.getByRole('button', { name: 'お気に入り済み' }))

    expect(addCafeToList).toHaveBeenCalledTimes(1)
    expect(removeCafeFromList).not.toHaveBeenCalled()
  })

  it('登録済みなら解除を呼ぶ。list_type を必ず添える', async () => {
    removeCafeFromList.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()

    render(
      <CafeListButtons
        cafeId={cafeId}
        membership={{ favorite: true, want_to_go: false }}
        isAuthenticated={true}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'お気に入り済み' }))

    // list_type が欠けると、もう一方のリストまで消える
    await waitFor(() =>
      expect(removeCafeFromList).toHaveBeenCalledWith({ cafeId, listType: 'favorite' }),
    )
  })

  it('2つのリストは排他ではない。片方を押しても他方は変わらない', async () => {
    addCafeToList.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()

    render(
      <CafeListButtons
        cafeId={cafeId}
        membership={{ favorite: true, want_to_go: false }}
        isAuthenticated={true}
      />,
    )
    await user.click(screen.getByRole('button', { name: '行きたい' }))

    await waitFor(() =>
      expect(addCafeToList).toHaveBeenCalledWith({ cafeId, listType: 'want_to_go' }),
    )
    expect(screen.getByRole('button', { name: 'お気に入り済み' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '行きたい済み' })).toBeInTheDocument()
  })

  it('失敗したら元の状態に戻し、理由を伝える', async () => {
    addCafeToList.mockResolvedValue({ ok: false, error: 'FORBIDDEN' })
    const user = userEvent.setup()

    render(<CafeListButtons cafeId={cafeId} membership={none} isAuthenticated={true} />)
    await user.click(screen.getByRole('button', { name: '行きたい' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('この操作を行う権限がありません')
    })
    expect(screen.getByRole('button', { name: '行きたい' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('CONFLICT（既に登録済み）は成功として扱う', async () => {
    addCafeToList.mockResolvedValue({ ok: false, error: 'CONFLICT' })
    const user = userEvent.setup()

    render(<CafeListButtons cafeId={cafeId} membership={none} isAuthenticated={true} />)
    await user.click(screen.getByRole('button', { name: 'お気に入り' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'お気に入り済み' })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('未ログインにはボタンではなくログイン導線を出す', () => {
    render(<CafeListButtons cafeId={cafeId} membership={none} isAuthenticated={false} />)

    expect(screen.queryByRole('button', { name: 'お気に入り' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ログイン' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`/cafes/${cafeId}`)}`,
    )
  })
})
