import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PostListItem } from '@/lib/posts/post-list'
import { PostCard } from './post-card'

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
}

const storageImage = {
  url: 'http://127.0.0.1:54321/storage/v1/object/public/post-images/u1/p1/a.webp',
  altText: '',
}

describe('PostCard', () => {
  it('本文の抜粋から投稿詳細へリンクする', () => {
    render(<PostCard post={base} />)
    expect(screen.getByRole('link', { name: '朝のカフェで一息' })).toHaveAttribute(
      'href',
      `/posts/${base.id}`,
    )
  })

  it('ブログはタイトルを見出しで出す', () => {
    render(<PostCard post={{ ...base, postType: 'blog', title: '渋谷の朝カフェ3選' }} />)
    expect(screen.getByRole('heading', { name: '渋谷の朝カフェ3選' })).toBeInTheDocument()
  })

  it('自前の Storage の画像だけを出し、外部ホストは描画しない', () => {
    const { container: own } = render(<PostCard post={{ ...base, image: storageImage }} />)
    expect(own.querySelector('img')).not.toBeNull()

    const { container: external } = render(
      <PostCard
        post={{ ...base, image: { url: 'https://attacker.example/px.gif', altText: '' } }}
      />,
    )
    expect(external.querySelector('img')).toBeNull()
  })

  it('写真だけの投稿でもリンクに名前が付く', () => {
    render(<PostCard post={{ ...base, excerpt: '', image: storageImage }} />)
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
      />,
    )
    expect(screen.getByRole('link', { name: /テスト珈琲店/ })).toHaveAttribute('href', '/cafes/c1')
    expect(screen.getByRole('link', { name: '#朝カフェ' })).toHaveAttribute(
      'href',
      '/explore?tag=morning-cafe',
    )
  })

  it('いいね・コメント・保存のアクションは出さない（インタラクション未実装）', () => {
    render(<PostCard post={base} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
