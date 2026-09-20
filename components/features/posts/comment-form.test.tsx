import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentForm } from './comment-form'

const createComment = vi.fn()

vi.mock('@/app/_actions/comments', () => ({
  createComment: (input: unknown) => createComment(input),
}))

const postId = '11111111-1111-4111-8111-111111111111'
const commentId = '22222222-2222-4222-8222-222222222222'
const viewer = { id: 'u1', username: 'kaho', displayName: 'かほ', avatarUrl: null }

function setup(props: Partial<Parameters<typeof CommentForm>[0]> = {}) {
  const onCreated = vi.fn()
  render(
    <CommentForm
      postId={postId}
      viewer={viewer}
      isAuthenticated
      returnTo={`/posts/${postId}`}
      onCreated={onCreated}
      {...props}
    />,
  )
  return { onCreated }
}

beforeEach(() => {
  createComment.mockReset()
  createComment.mockResolvedValue({ ok: true, data: { commentId, commentCount: 1 } })
})

describe('CommentForm', () => {
  it('未ログインではログイン導線だけを出す', () => {
    setup({ isAuthenticated: false })

    expect(screen.getByRole('link', { name: 'ログイン' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`/posts/${postId}`)}`,
    )
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(createComment).not.toHaveBeenCalled()
  })

  it('返信の場合はログイン導線の文言が「返信」になる', () => {
    setup({ isAuthenticated: false, parentId: '33333333-3333-4333-8333-333333333333' })

    expect(screen.getByText(/すると返信できます/)).toBeInTheDocument()
  })

  it('空白のみの送信は createComment を呼ばずエラーを出す', async () => {
    const { onCreated } = setup()

    await userEvent.type(screen.getByRole('textbox'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'コメントする' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本文か写真のどちらかを入力してください',
    )
    expect(createComment).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('送信すると trim した本文で createComment を呼び、成功したら onCreated して本文をクリアする', async () => {
    const { onCreated } = setup()

    await userEvent.type(screen.getByRole('textbox'), '  こんにちは  ')
    await userEvent.click(screen.getByRole('button', { name: 'コメントする' }))

    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith({
        postId,
        parentId: undefined,
        body: 'こんにちは',
      }),
    )
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: commentId, body: 'こんにちは', author: viewer }),
        1,
      ),
    )
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('返信では parentId を付けて呼ぶ', async () => {
    const parentId = '33333333-3333-4333-8333-333333333333'
    setup({ parentId, submitLabel: '返信する' })

    await userEvent.type(screen.getByRole('textbox'), '返信本文')
    await userEvent.click(screen.getByRole('button', { name: '返信する' }))

    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith({ postId, parentId, body: '返信本文' }),
    )
  })

  it('viewer が無い場合は「自分」で仮表示する', async () => {
    const { onCreated } = setup({ viewer: null })

    await userEvent.type(screen.getByRole('textbox'), 'こんにちは')
    await userEvent.click(screen.getByRole('button', { name: 'コメントする' }))

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          author: { id: '', username: '', displayName: '自分', avatarUrl: null },
        }),
        1,
      ),
    )
  })

  it('失敗したらエラーを表示し、本文は残す', async () => {
    createComment.mockResolvedValue({ ok: false, error: 'POST_NOT_FOUND' })
    const { onCreated } = setup()

    await userEvent.type(screen.getByRole('textbox'), 'こんにちは')
    await userEvent.click(screen.getByRole('button', { name: 'コメントする' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('投稿が見つかりませんでした')
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('こんにちは')
  })

  it('送信中は aria-busy になり、連打では2回目を送らない', async () => {
    createComment.mockImplementation(() => new Promise(() => {}))
    setup()

    await userEvent.type(screen.getByRole('textbox'), 'こんにちは')
    const button = screen.getByRole('button', { name: 'コメントする' })
    await userEvent.click(button)
    await userEvent.click(button)

    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    expect(createComment).toHaveBeenCalledTimes(1)
  })

  it('キャンセルボタンは onCancel を呼ぶ（返信フォームの折りたたみ）', async () => {
    const onCancel = vi.fn()
    setup({ onCancel })

    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(onCancel).toHaveBeenCalled()
  })
})
