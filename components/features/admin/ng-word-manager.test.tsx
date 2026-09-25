import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NgWordListItem } from '@/app/_actions/admin-ng-words'
import { NgWordManager } from './ng-word-manager'

const addNgWord = vi.fn()
const deleteNgWord = vi.fn()

vi.mock('@/app/_actions/admin-ng-words', () => ({
  addNgWord: (input: unknown) => addNgWord(input),
  deleteNgWord: (input: unknown) => deleteNgWord(input),
}))

const existingItem: NgWordListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  word: '既存ワード',
  severity: 'block',
  category: null,
  createdAt: '2026-03-01T00:00:00.000Z',
}

beforeEach(() => {
  addNgWord.mockReset()
  deleteNgWord.mockReset()
  addNgWord.mockResolvedValue({
    ok: true,
    data: { ngWordId: '22222222-2222-4222-8222-222222222222' },
  })
  deleteNgWord.mockResolvedValue({ ok: true, data: null })
})

describe('NgWordManager', () => {
  it('追加送信中も入力欄と追加ボタンを disabled にしない（D60）', async () => {
    addNgWord.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<NgWordManager initialItems={[]} />)

    await user.type(screen.getByLabelText('単語'), '新規ワード')
    await user.click(screen.getByRole('button', { name: '追加する' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '追加する' })).toHaveAttribute('aria-busy', 'true'),
    )
    expect(screen.getByLabelText('単語')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '追加する' })).not.toBeDisabled()
  })

  it('単語が空だと追加ボタンは disabled のまま（バリデーション由来はそのまま無効化する）', () => {
    render(<NgWordManager initialItems={[]} />)

    expect(screen.getByRole('button', { name: '追加する' })).toBeDisabled()
  })

  it('追加の連打では2回目を送らない', async () => {
    addNgWord.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<NgWordManager initialItems={[]} />)

    await user.type(screen.getByLabelText('単語'), '新規ワード')
    const submitButton = screen.getByRole('button', { name: '追加する' })
    await user.click(submitButton)
    await user.click(submitButton)

    expect(addNgWord).toHaveBeenCalledTimes(1)
  })

  // 削除確認ダイアログは楽観更新で即座に閉じる（blocked-user-list.tsx と同じ方針）ため、
  // 送信中の様子は他の単語の「削除」ボタンの aria-busy で確認する
  it('削除送信中も他の単語の削除ボタンを disabled にしない（D60）', async () => {
    deleteNgWord.mockReturnValue(new Promise(() => {}))
    const otherItem: NgWordListItem = { ...existingItem, id: 'other-id', word: '別のワード' }
    const user = userEvent.setup()
    render(<NgWordManager initialItems={[existingItem, otherItem]} />)

    await user.click(screen.getAllByRole('button', { name: '削除' })[0] as HTMLElement)
    await user.click(screen.getByRole('button', { name: '削除する' }))

    const otherDeleteButton = screen.getByRole('button', { name: '削除' })
    await waitFor(() => expect(otherDeleteButton).toHaveAttribute('aria-busy', 'true'))
    expect(otherDeleteButton).not.toBeDisabled()
  })

  it('削除送信中は追加フォームの送信も止まる（isPending共有設計）', async () => {
    deleteNgWord.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<NgWordManager initialItems={[existingItem]} />)

    await user.click(screen.getByRole('button', { name: '削除' }))
    await user.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(screen.getByText('処理中')).toBeInTheDocument())

    await user.type(screen.getByLabelText('単語'), '追加試行')
    await user.click(screen.getByRole('button', { name: '追加する' }))

    expect(addNgWord).not.toHaveBeenCalled()
  })
})
