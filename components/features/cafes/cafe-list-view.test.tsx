import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CafeListEntry } from '@/lib/cafes/user-cafe-lists'
import { CafeListView } from './cafe-list-view'

const removeCafeFromList = vi.fn()

vi.mock('@/app/_actions/cafe-lists', () => ({
  removeCafeFromList: (input: unknown) => removeCafeFromList(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const entries: CafeListEntry[] = [
  {
    cafeId: '11111111-1111-4111-8111-111111111111',
    name: '表参道ロースタリー',
    areaLabel: '渋谷',
    note: '豆が好み',
    addedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    cafeId: '22222222-2222-4222-8222-222222222222',
    name: '二番目の店',
    areaLabel: null,
    note: null,
    addedAt: '2026-02-01T00:00:00.000Z',
  },
]

beforeEach(() => {
  removeCafeFromList.mockReset()
})

describe('CafeListView', () => {
  it('カフェ名・エリア・メモ・追加日を出す', () => {
    render(<CafeListView listType="favorite" initialEntries={entries} />)

    expect(screen.getByRole('link', { name: '表参道ロースタリー' })).toHaveAttribute(
      'href',
      `/cafes/${entries[0]?.cafeId}`,
    )
    expect(screen.getByText('渋谷')).toBeInTheDocument()
    expect(screen.getByText('豆が好み')).toBeInTheDocument()
    expect(screen.getByText('追加: 2026年3月1日')).toBeInTheDocument()
  })

  it('解除ボタンはどのカフェを外すのか名前で分かる', () => {
    render(<CafeListView listType="want_to_go" initialEntries={entries} />)

    expect(screen.getByRole('button', { name: '二番目の店を行きたいから外す' })).toBeInTheDocument()
  })

  it('押した瞬間に一覧から消える（楽観更新）。list_type も渡す', async () => {
    removeCafeFromList.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CafeListView listType="favorite" initialEntries={entries} />)
    await user.click(screen.getByRole('button', { name: '表参道ロースタリーをお気に入りから外す' }))

    expect(screen.queryByText('表参道ロースタリー')).not.toBeInTheDocument()
    expect(removeCafeFromList).toHaveBeenCalledWith({
      cafeId: entries[0]?.cafeId,
      listType: 'favorite',
    })
  })

  // isPending は一覧全体で共有される。解除した行のボタンは楽観更新で即座に
  // 消えるが、他の行のボタンを disabled にするとその行のフォーカスが
  // 突然奪われてしまうため、無効化せず aria-busy で送信中を示すだけにする
  it('1件を解除している間、他の行のボタンは無効化せず送信中を示す', async () => {
    removeCafeFromList.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()

    render(<CafeListView listType="favorite" initialEntries={entries} />)
    await user.click(screen.getByRole('button', { name: '表参道ロースタリーをお気に入りから外す' }))

    const button = screen.getByRole('button', { name: '二番目の店をお気に入りから外す' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('失敗したら一覧を元に戻し、理由を伝える', async () => {
    removeCafeFromList.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    const user = userEvent.setup()

    render(<CafeListView listType="favorite" initialEntries={entries} />)
    await user.click(screen.getByRole('button', { name: '表参道ロースタリーをお気に入りから外す' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '表参道ロースタリー' })).toBeInTheDocument()
  })

  it('0件なら追加のしかたを案内する', () => {
    render(<CafeListView listType="want_to_go" initialEntries={[]} />)

    expect(screen.getByText(/行きたいのカフェはまだありません/)).toBeInTheDocument()
  })

  // 最後の1件を外すと空状態に切り替わる。ここで早期リターンすると
  // live region も role="alert" も描画前に消える
  it('最後の1件を外して空になっても読み上げ領域を残す', async () => {
    removeCafeFromList.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()
    const { container } = render(
      <CafeListView listType="favorite" initialEntries={entries.slice(0, 1)} />,
    )

    await user.click(screen.getByRole('button', { name: '表参道ロースタリーをお気に入りから外す' }))

    await waitFor(() =>
      expect(screen.getByText(/お気に入りのカフェはまだありません/)).toBeInTheDocument(),
    )
    // 空状態と同時に live region が消えると、この解除は一切アナウンスされない
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument()
  })

  it('最後の1件の解除に失敗したらエラーを出す', async () => {
    removeCafeFromList.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    const user = userEvent.setup()
    const only = entries.slice(0, 1)

    render(<CafeListView listType="favorite" initialEntries={only} />)
    await user.click(screen.getByRole('button', { name: '表参道ロースタリーをお気に入りから外す' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
