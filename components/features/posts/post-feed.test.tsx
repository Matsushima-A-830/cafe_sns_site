import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostListCursor, PostListItem, PostListPage } from '@/lib/posts/post-list'
import type { FeedQuery } from '@/lib/validators/feed'
import { intersectionObserverInstances } from '../../../tests/setup'
import { PostFeed } from './post-feed'

const loadMoreFeed = vi.fn()

vi.mock('@/app/_actions/feed', () => ({
  loadMoreFeed: (input: unknown) => loadMoreFeed(input),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({ refresh: vi.fn() }),
}))

const query: FeedQuery = {
  scope: 'new',
  tagSlug: null,
  areaCode: null,
  authorUsername: null,
  cafeId: null,
  lat: null,
  lng: null,
}

function makePost(overrides: Partial<PostListItem> = {}): PostListItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    postType: 'short',
    title: null,
    excerpt: '朝のカフェで一息',
    publishedAt: '2026-09-14T01:00:00Z',
    author: { id: 'u1', username: 'kaho', displayName: 'かほ', avatarUrl: null },
    cafe: null,
    image: null,
    tags: [],
    likeCount: 0,
    likedByViewer: false,
    bookmarkCount: 0,
    bookmarkedByViewer: false,
    isOfficial: false,
    officialFormat: null,
    metadata: null,
    ...overrides,
  }
}

const cursor1: PostListCursor = { publishedAt: '2026-09-14T01:00:00Z', id: 'p1' }

function setup(props: Partial<Parameters<typeof PostFeed>[0]> = {}) {
  const initialPage: PostListPage = {
    items: [makePost()],
    nextCursor: cursor1,
  }
  return render(<PostFeed initialPage={initialPage} query={query} isAuthenticated {...props} />)
}

beforeEach(() => {
  loadMoreFeed.mockReset()
  sessionStorage.clear()
})

describe('PostFeed', () => {
  it('投稿が無ければ空メッセージを出す', () => {
    render(
      <PostFeed
        initialPage={{ items: [], nextCursor: null }}
        query={query}
        isAuthenticated
        emptyMessage="まだありません"
      />,
    )
    expect(screen.getByText('まだありません')).toBeInTheDocument()
  })

  it('番兵がビューポートに交差すると次ページを自動で読み込む', async () => {
    loadMoreFeed.mockResolvedValue({
      ok: true,
      data: { items: [makePost({ id: 'p2', excerpt: '2杯目のコーヒー' })], nextCursor: null },
    })
    setup()

    // StrictMode 相当の開発時二重実行で observer が作り直されることがあるため、
    // 最後に作られた（＝クリーンアップされていない）インスタンスを使う
    expect(intersectionObserverInstances.length).toBeGreaterThan(0)
    act(() => {
      intersectionObserverInstances.at(-1)?.trigger(true)
    })

    await waitFor(() => expect(screen.getByText('2杯目のコーヒー')).toBeInTheDocument())
    expect(loadMoreFeed).toHaveBeenCalledWith({ query, cursor: cursor1 })
  })

  it('もっと見るボタンはキーボード操作（クリック）でも読み込める', async () => {
    loadMoreFeed.mockResolvedValue({
      ok: true,
      data: { items: [makePost({ id: 'p2', excerpt: '2杯目のコーヒー' })], nextCursor: null },
    })
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))

    await waitFor(() => expect(screen.getByText('2杯目のコーヒー')).toBeInTheDocument())
  })

  it('読み込み失敗時はエラーメッセージを出す', async () => {
    loadMoreFeed.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('読み込んだページ数とスクロール位置を sessionStorage に保存し、次のマウントで同じページ数ぶん読み込み直す', async () => {
    loadMoreFeed.mockResolvedValue({
      ok: true,
      data: { items: [makePost({ id: 'p2', excerpt: '2杯目のコーヒー' })], nextCursor: null },
    })
    const { unmount } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))
    await waitFor(() => expect(screen.getByText('2杯目のコーヒー')).toBeInTheDocument())
    unmount()

    // 投稿データ自体はキャッシュせず、保存した1ページぶんを loadMoreFeed で取得し直す
    setup()
    await waitFor(() => expect(screen.getByText('2杯目のコーヒー')).toBeInTheDocument())
    expect(loadMoreFeed).toHaveBeenCalledTimes(2)
  })

  it('リロード・再訪問時は sessionStorage の投稿データを信頼せず、常に最新の initialPage と再取得結果を表示する', async () => {
    loadMoreFeed.mockResolvedValueOnce({
      ok: true,
      data: { items: [makePost({ id: 'p2', excerpt: '2杯目のコーヒー' })], nextCursor: null },
    })
    const { unmount } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))
    await waitFor(() => expect(screen.getByText('2杯目のコーヒー')).toBeInTheDocument())
    unmount()

    // 2回目のマウントまでにサーバー側のデータが変わった想定
    // （例: 元の投稿がブロック/削除されて別の投稿に置き換わった）
    const freshInitialPage: PostListPage = {
      items: [makePost({ id: 'p-fresh', excerpt: '最新の投稿' })],
      nextCursor: cursor1,
    }
    loadMoreFeed.mockResolvedValueOnce({
      ok: true,
      data: {
        items: [makePost({ id: 'p3', excerpt: '3杯目のコーヒー（再取得）' })],
        nextCursor: null,
      },
    })
    render(<PostFeed initialPage={freshInitialPage} query={query} isAuthenticated />)

    // sessionStorage にあった「2杯目のコーヒー」は復元されない。
    // 最新の initialPage と、再取得した最新のページだけが表示される
    expect(screen.getByText('最新の投稿')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('3杯目のコーヒー（再取得）')).toBeInTheDocument())
    expect(screen.queryByText('2杯目のコーヒー')).not.toBeInTheDocument()
    expect(loadMoreFeed).toHaveBeenCalledTimes(2)
  })

  it('画面・クエリが変われば前の sessionStorage を引き継がない', async () => {
    loadMoreFeed.mockResolvedValue({
      ok: true,
      data: { items: [makePost({ id: 'p2', excerpt: '2杯目のコーヒー' })], nextCursor: null },
    })
    const { unmount } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))
    await waitFor(() => expect(screen.getByText('2杯目のコーヒー')).toBeInTheDocument())
    unmount()

    // クエリが異なる（別タブ相当）新しいマウントでは、前のタブの投稿が残らない
    setup({ query: { ...query, scope: 'recommended' } })
    expect(screen.queryByText('2杯目のコーヒー')).not.toBeInTheDocument()
    expect(screen.getByText('朝のカフェで一息')).toBeInTheDocument()
  })

  it('cacheKeyが変われば、queryが同じでも前のsessionStorageを引き継がない（フォロー状態変化などquery外のremount対策）', async () => {
    loadMoreFeed.mockResolvedValue({
      ok: true,
      data: { items: [makePost({ id: 'p2', excerpt: '2杯目のコーヒー' })], nextCursor: null },
    })
    const { unmount } = setup({ cacheKey: 'user1:following' })

    await userEvent.click(screen.getByRole('button', { name: 'もっと見る' }))
    await waitFor(() => expect(screen.getByText('2杯目のコーヒー')).toBeInTheDocument())
    unmount()

    // query は同じだが cacheKey だけ変わる（フォロー解除後の remount 相当）。
    // サーバーが再計算した新しい initialPage が、フォロー前の古い一覧で上書きされてはいけない
    setup({ cacheKey: 'user1:not-following' })
    expect(screen.queryByText('2杯目のコーヒー')).not.toBeInTheDocument()
    expect(screen.getByText('朝のカフェで一息')).toBeInTheDocument()
  })
})
