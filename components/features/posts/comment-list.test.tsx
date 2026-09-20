import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommentItem } from '@/lib/posts/comments'
import { CommentList } from './comment-list'

const createComment = vi.fn()
const deleteComment = vi.fn()
const loadMoreComments = vi.fn()

vi.mock('@/app/_actions/comments', () => ({
  createComment: (input: unknown) => createComment(input),
  deleteComment: (input: unknown) => deleteComment(input),
  loadMoreComments: (input: unknown) => loadMoreComments(input),
}))

const postId = '11111111-1111-4111-8111-111111111111'
const author1 = { id: 'u1', username: 'kaho', displayName: 'かほ', avatarUrl: null }
const author2 = { id: 'u2', username: 'jun', displayName: 'じゅん', avatarUrl: null }
const viewer = author1

function makeComment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    id: 'c1',
    body: '最初のコメント',
    isOfficial: false,
    createdAt: '2026-09-14T01:00:00Z',
    updatedAt: '2026-09-14T01:00:00Z',
    author: author1,
    replies: [],
    ...overrides,
  }
}

function setup(props: Partial<Parameters<typeof CommentList>[0]> = {}) {
  return render(
    <CommentList
      postId={postId}
      initialItems={[]}
      initialCursor={null}
      initialCount={0}
      isAuthenticated
      canModerate={false}
      viewer={viewer}
      returnTo={`/posts/${postId}`}
      {...props}
    />,
  )
}

beforeEach(() => {
  createComment.mockReset()
  deleteComment.mockReset()
  loadMoreComments.mockReset()
})

describe('CommentList', () => {
  it('コメントが無ければ空メッセージを出す', () => {
    setup()

    expect(screen.getByText('まだコメントがありません。')).toBeInTheDocument()
    expect(screen.getByText('コメント 0件')).toBeInTheDocument()
  })

  it('返信は親コメントの下にインデントして表示する', () => {
    const item = makeComment({
      replies: [
        {
          id: 'r1',
          body: '返信本文',
          isOfficial: false,
          createdAt: '2026-09-14T02:00:00Z',
          updatedAt: '2026-09-14T02:00:00Z',
          author: author2,
        },
      ],
    })
    setup({ initialItems: [item], initialCount: 2 })

    expect(screen.getByText('最初のコメント')).toBeInTheDocument()
    expect(screen.getByText('返信本文')).toBeInTheDocument()
    expect(screen.getByText('じゅん')).toBeInTheDocument()
  })

  it('is_official は「オーナー公式」バッジを出す', () => {
    setup({ initialItems: [makeComment({ isOfficial: true })], initialCount: 1 })

    expect(screen.getByText('オーナー公式')).toBeInTheDocument()
  })

  it('コメントを投稿すると一覧末尾に追加され、件数が確定値に更新される', async () => {
    createComment.mockResolvedValue({
      ok: true,
      data: { commentId: 'new-1', commentCount: 3 },
    })
    setup({ initialItems: [makeComment()], initialCount: 1 })

    await userEvent.type(screen.getByRole('textbox', { name: 'コメントを書く' }), '新しいコメント')
    await userEvent.click(screen.getByRole('button', { name: 'コメントする' }))

    await waitFor(() => expect(screen.getByText('新しいコメント')).toBeInTheDocument())
    expect(screen.getByText('コメント 3件')).toBeInTheDocument()
  })

  it('返信ボタンで返信フォームが開き、送信すると親の返信に入れ子で追加される', async () => {
    createComment.mockResolvedValue({ ok: true, data: { commentId: 'r2', commentCount: 2 } })
    setup({ initialItems: [makeComment()], initialCount: 1 })

    await userEvent.click(screen.getByRole('button', { name: '返信' }))
    await userEvent.type(screen.getByRole('textbox', { name: '返信を書く' }), '返信します')
    await userEvent.click(screen.getByRole('button', { name: '返信する' }))

    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({ postId, parentId: 'c1', body: '返信します' }),
    )
    await waitFor(() => expect(screen.getByText('返信します')).toBeInTheDocument())
    // 返信フォームは投稿後に閉じる
    expect(screen.queryByRole('textbox', { name: '返信を書く' })).toBeNull()
  })

  it('自分のコメントは確認のうえ削除でき、件数が確定値に更新される', async () => {
    deleteComment.mockResolvedValue({ ok: true, data: { commentCount: 0 } })
    setup({ initialItems: [makeComment()], initialCount: 1 })

    await userEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(screen.getByText('本当に削除しますか？')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(deleteComment).toHaveBeenCalledWith({ commentId: 'c1', postId })
    await waitFor(() => expect(screen.queryByText('最初のコメント')).toBeNull())
    expect(screen.getByText('コメント 0件')).toBeInTheDocument()
  })

  it('削除の「やめる」で確認状態が解除される', async () => {
    setup({ initialItems: [makeComment()], initialCount: 1 })

    await userEvent.click(screen.getByRole('button', { name: '削除' }))
    await userEvent.click(screen.getByRole('button', { name: 'やめる' }))

    expect(screen.queryByText('本当に削除しますか？')).toBeNull()
    expect(screen.getByText('最初のコメント')).toBeInTheDocument()
    expect(deleteComment).not.toHaveBeenCalled()
  })

  it('他人のコメントは canModerate=false だと削除ボタンが出ない', () => {
    setup({ initialItems: [makeComment({ author: author2 })], initialCount: 1 })

    expect(screen.queryByRole('button', { name: '削除' })).toBeNull()
  })

  it('投稿主（canModerate）は他人のコメントも削除できる', async () => {
    deleteComment.mockResolvedValue({ ok: true, data: { commentCount: 0 } })
    setup({ initialItems: [makeComment({ author: author2 })], initialCount: 1, canModerate: true })

    await userEvent.click(screen.getByRole('button', { name: '削除' }))
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(deleteComment).toHaveBeenCalledWith({ commentId: 'c1', postId }))
  })

  it('削除に失敗したら一覧と件数を元に戻してエラーを表示する', async () => {
    deleteComment.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    setup({ initialItems: [makeComment()], initialCount: 1 })

    await userEvent.click(screen.getByRole('button', { name: '削除' }))
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('最初のコメント')).toBeInTheDocument()
    expect(screen.getByText('コメント 1件')).toBeInTheDocument()
  })

  it('もっと見るで次ページを追記し、次のカーソルが無ければボタンが消える', async () => {
    loadMoreComments.mockResolvedValue({
      ok: true,
      data: { items: [makeComment({ id: 'c2', body: '2件目' })], nextCursor: null },
    })
    setup({
      initialItems: [makeComment()],
      initialCount: 2,
      initialCursor: { createdAt: '2026-09-14T01:00:00Z', id: 'c1' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))

    await waitFor(() => expect(screen.getByText('2件目')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'もっと見る' })).toBeNull()
  })

  it('未ログインではコメントフォームの代わりにログイン導線が出る', () => {
    setup({ isAuthenticated: false, viewer: null })

    expect(screen.getByRole('link', { name: 'ログイン' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('未ログインでは返信ボタンを出さない', () => {
    setup({ isAuthenticated: false, viewer: null, initialItems: [makeComment()], initialCount: 1 })

    expect(screen.queryByRole('button', { name: '返信' })).toBeNull()
  })
})
