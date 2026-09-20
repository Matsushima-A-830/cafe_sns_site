import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookmarkButton } from './bookmark-button'

const bookmarkPost = vi.fn()
const unbookmarkPost = vi.fn()

vi.mock('@/app/_actions/bookmarks', () => ({
  bookmarkPost: (input: unknown) => bookmarkPost(input),
  unbookmarkPost: (input: unknown) => unbookmarkPost(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const postId = '11111111-1111-4111-8111-111111111111'

function setup(props: Partial<Parameters<typeof BookmarkButton>[0]> = {}) {
  return render(
    <BookmarkButton
      postId={postId}
      initialBookmarked={false}
      initialCount={3}
      isAuthenticated
      returnTo={`/posts/${postId}`}
      {...props}
    />,
  )
}

beforeEach(() => {
  bookmarkPost.mockReset()
  unbookmarkPost.mockReset()
  bookmarkPost.mockResolvedValue({ ok: true, data: { bookmarkCount: 4 } })
  unbookmarkPost.mockResolvedValue({ ok: true, data: { bookmarkCount: 2 } })
})

describe('BookmarkButton', () => {
  it('保存すると件数と押下状態を即座に反映する（楽観更新）', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: /^保存/ }))

    const button = screen.getByRole('button', { name: /保存済み/ })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('4件')
    await waitFor(() => expect(bookmarkPost).toHaveBeenCalledWith({ postId }))
  })

  it('保存済みから押すと解除される', async () => {
    setup({ initialBookmarked: true, initialCount: 3 })

    await userEvent.click(screen.getByRole('button', { name: /保存済み/ }))

    const button = screen.getByRole('button', { name: /^保存/ })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveTextContent('2件')
    await waitFor(() => expect(unbookmarkPost).toHaveBeenCalledWith({ postId }))
  })

  it('失敗したら件数と押下状態を元に戻してエラーを出す', async () => {
    bookmarkPost.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    setup()

    await userEvent.click(screen.getByRole('button', { name: /^保存/ }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    const button = screen.getByRole('button', { name: /^保存/ })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveTextContent('3件')
  })

  it('サーバーが返した件数で楽観更新の ±1 を上書きする', async () => {
    // 押した時点の表示（3件）が古く、実際には他にも保存が付いていた場合
    bookmarkPost.mockResolvedValue({ ok: true, data: { bookmarkCount: 9 } })
    setup()

    await userEvent.click(screen.getByRole('button', { name: /^保存/ }))

    // 楽観更新の 4件 ではなく確定値の 9件 に落ち着く
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /保存済み/ })).toHaveTextContent('9件'),
    )
  })

  it('二重保存はサーバー側で成功として返り、件数も確定値になる', async () => {
    bookmarkPost.mockResolvedValue({ ok: true, data: { bookmarkCount: 1 } })
    setup()

    await userEvent.click(screen.getByRole('button', { name: /^保存/ }))

    await waitFor(() => expect(bookmarkPost).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
    const button = screen.getByRole('button', { name: /保存済み/ })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('1件')
  })

  it('送信中も disabled にしない（フォーカスを body へ落とさない — D33）', async () => {
    bookmarkPost.mockImplementation(() => new Promise(() => {}))
    setup()

    const button = screen.getByRole('button', { name: /^保存/ })
    await userEvent.click(button)

    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    expect(button).not.toBeDisabled()
  })

  it('送信中の連打では2回目を送らない', async () => {
    bookmarkPost.mockImplementation(() => new Promise(() => {}))
    setup()

    const button = screen.getByRole('button', { name: /^保存/ })
    await userEvent.click(button)
    await userEvent.click(button)

    expect(bookmarkPost).toHaveBeenCalledTimes(1)
  })

  it('未ログインでは件数だけ出す（一覧で導線を繰り返さない）', () => {
    setup({ isAuthenticated: false })

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('保存 3件')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('showLoginHint を付けるとログインへの導線を出す（投稿詳細）', () => {
    setup({ isAuthenticated: false, showLoginHint: true })

    expect(screen.getByRole('link', { name: 'ログイン' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`/posts/${postId}`)}`,
    )
  })
})
