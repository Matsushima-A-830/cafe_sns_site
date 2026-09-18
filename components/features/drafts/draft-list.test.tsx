import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftSummary } from '@/app/_actions/drafts'
import { DRAFT_PAYLOAD_VERSION } from '@/lib/validators/drafts'
import { DraftList } from './draft-list'

const deleteDraft = vi.fn()

vi.mock('@/app/_actions/drafts', () => ({
  deleteDraft: (input: unknown) => deleteDraft(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文の冒頭' }] }],
}

const loaded: DraftSummary = {
  clientDraftKey: 'draft-aaaaaaaa',
  lastSavedAt: '2026-03-01T00:00:00.000Z',
  stale: false,
  payload: {
    v: DRAFT_PAYLOAD_VERSION,
    post_id: '11111111-1111-4111-8111-111111111111',
    post_type: 'blog',
    title: '下書きのタイトル',
    body_json: bodyJson,
    tag_ids: [],
    image_paths: [],
    cafe_id: null,
    visibility: 'public',
  },
}

const stale: DraftSummary = {
  clientDraftKey: 'draft-bbbbbbbb',
  lastSavedAt: '2026-02-01T00:00:00.000Z',
  stale: true,
}

beforeEach(() => {
  deleteDraft.mockReset()
})

describe('DraftList', () => {
  it('再開できる下書きは「続きを書く」で対応するフォームへ送る', () => {
    render(<DraftList initialDrafts={[loaded]} />)

    expect(screen.getByRole('link', { name: '続きを書く' })).toHaveAttribute(
      'href',
      '/new/blog?draft=draft-aaaaaaaa',
    )
    expect(screen.getByText('下書きのタイトル')).toBeInTheDocument()
  })

  it('バージョン不一致の下書きは削除だけできる', () => {
    render(<DraftList initialDrafts={[stale]} />)

    expect(screen.getByText('古い形式の下書き（再開できません）')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '続きを書く' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument()
  })

  it('削除は確認ダイアログを経る。閉じるだけなら消さない', async () => {
    const user = userEvent.setup()
    render(<DraftList initialDrafts={[loaded]} />)

    await user.click(screen.getByRole('button', { name: '削除' }))
    expect(screen.getByText('この下書きを削除しますか？')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '削除しない' }))

    expect(deleteDraft).not.toHaveBeenCalled()
    expect(screen.getByText('下書きのタイトル')).toBeInTheDocument()
  })

  it('確認すると削除して一覧から消す', async () => {
    deleteDraft.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()
    render(<DraftList initialDrafts={[loaded]} />)

    await user.click(screen.getByRole('button', { name: '削除' }))
    await user.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() =>
      expect(deleteDraft).toHaveBeenCalledWith({ clientDraftKey: 'draft-aaaaaaaa' }),
    )
    expect(screen.queryByText('下書きのタイトル')).not.toBeInTheDocument()
  })

  it('削除に失敗したら一覧を元に戻す', async () => {
    deleteDraft.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    const user = userEvent.setup()
    render(<DraftList initialDrafts={[loaded]} />)

    await user.click(screen.getByRole('button', { name: '削除' }))
    await user.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('下書きのタイトル')).toBeInTheDocument()
  })

  it('0件なら自動保存の案内を出す', () => {
    render(<DraftList initialDrafts={[]} />)

    expect(screen.getByText(/下書きはありません/)).toBeInTheDocument()
  })
})
