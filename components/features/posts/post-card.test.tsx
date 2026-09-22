import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PostListItem } from '@/lib/posts/post-list'
import { PostCard } from './post-card'

// カード内の LikeButton が useRouter を使う
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const base: PostListItem = {
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
}

const storageImage = {
  url: 'http://127.0.0.1:54321/storage/v1/object/public/post-images/u1/p1/a.webp',
  altText: '',
}

describe('PostCard', () => {
  it('本文の抜粋から投稿詳細へリンクする', () => {
    render(<PostCard post={base} isAuthenticated />)
    expect(screen.getByRole('link', { name: '朝のカフェで一息' })).toHaveAttribute(
      'href',
      `/posts/${base.id}`,
    )
  })

  it('ブログはタイトルを見出しで出す', () => {
    render(
      <PostCard post={{ ...base, postType: 'blog', title: '渋谷の朝カフェ3選' }} isAuthenticated />,
    )
    expect(screen.getByRole('heading', { name: '渋谷の朝カフェ3選' })).toBeInTheDocument()
  })

  it('自前の Storage の画像だけを出し、外部ホストは描画しない', () => {
    const { container: own } = render(
      <PostCard post={{ ...base, image: storageImage }} isAuthenticated />,
    )
    expect(own.querySelector('img')).not.toBeNull()

    const { container: external } = render(
      <PostCard
        post={{ ...base, image: { url: 'https://attacker.example/px.gif', altText: '' } }}
        isAuthenticated
      />,
    )
    expect(external.querySelector('img')).toBeNull()
  })

  it('写真だけの投稿でもリンクに名前が付く', () => {
    render(<PostCard post={{ ...base, excerpt: '', image: storageImage }} isAuthenticated />)
    expect(screen.getByRole('link', { name: 'かほさんの投稿' })).toBeInTheDocument()
  })

  it('カフェとタグの絞り込みリンクを出す', () => {
    render(
      <PostCard
        post={{
          ...base,
          cafe: { id: 'c1', name: 'テスト珈琲店', areaLabel: '渋谷区' },
          tags: [{ id: 't1', slug: 'morning-cafe', label: '朝カフェ' }],
        }}
        isAuthenticated
      />,
    )
    expect(screen.getByRole('link', { name: /テスト珈琲店/ })).toHaveAttribute('href', '/cafes/c1')
    expect(screen.getByRole('link', { name: '#朝カフェ' })).toHaveAttribute(
      'href',
      '/explore?tag=morning-cafe',
    )
  })

  it('いいねボタンを件数付きで出す', () => {
    render(<PostCard post={{ ...base, likeCount: 12 }} isAuthenticated />)

    const button = screen.getByRole('button', { name: /いいね/ })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    // 件数を数字だけにしない（読み上げで何の数か分かるようにする）
    expect(button).toHaveTextContent('12件')
  })

  it('いいね済みは aria-pressed とラベルの両方で示す（色だけにしない）', () => {
    render(<PostCard post={{ ...base, likeCount: 3, likedByViewer: true }} isAuthenticated />)

    const button = screen.getByRole('button', { name: /いいね済み/ })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('未ログインではボタンを出さず件数だけ見せる', () => {
    render(<PostCard post={{ ...base, likeCount: 5 }} isAuthenticated={false} />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('いいね 5件')).toBeInTheDocument()
  })

  it('保存ボタンを件数付きで出す', () => {
    render(<PostCard post={{ ...base, bookmarkCount: 7 }} isAuthenticated />)

    const button = screen.getByRole('button', { name: /^保存/ })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveTextContent('7件')
  })

  it('保存済みは aria-pressed とラベルの両方で示す（色だけにしない）', () => {
    render(
      <PostCard post={{ ...base, bookmarkCount: 2, bookmarkedByViewer: true }} isAuthenticated />,
    )

    const button = screen.getByRole('button', { name: /保存済み/ })
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('コメントの導線は出さない（返信UIは投稿詳細のみ）', () => {
    render(<PostCard post={base} isAuthenticated />)
    expect(screen.queryByText(/コメント/)).toBeNull()
  })
})
