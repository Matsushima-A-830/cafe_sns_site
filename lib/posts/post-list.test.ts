import { describe, expect, it } from 'vitest'
import { postExcerpt, toPostListItem } from './post-list'

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  post_type: 'short',
  title: null,
  body_text: '本文',
  published_at: '2026-09-15T00:00:00.000Z',
  created_at: '2026-09-01T00:00:00.000Z',
  like_count: 0,
  author: {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'taro',
    display_name: 'たろう',
    avatar_url: null,
  },
  cafe: null,
  post_images: [],
  post_tags: [],
}

const toUrl = (path: string) => `https://example.test/${path}`

describe('postExcerpt', () => {
  it('改行と連続する空白を1つにまとめる', () => {
    expect(postExcerpt('  朝の\n\nカフェ　')).toBe('朝の カフェ')
  })

  it('120文字を超えたら切り詰めて … を付ける', () => {
    const excerpt = postExcerpt('あ'.repeat(200))
    expect(excerpt).toHaveLength(121)
    expect(excerpt.endsWith('…')).toBe(true)
  })

  it('サロゲートペアを途中で割らない', () => {
    const excerpt = postExcerpt('☕'.repeat(60) + '🍰'.repeat(120))
    expect(excerpt).toBe(`${'☕'.repeat(60)}${'🍰'.repeat(60)}…`)
    expect(excerpt).not.toContain('�')
  })

  it('body_text が null の投稿は空文字', () => {
    expect(postExcerpt(null)).toBe('')
  })
})

describe('toPostListItem', () => {
  it('カードに必要な形へ変換する', () => {
    const item = toPostListItem({ ...row }, toUrl)

    expect(item.postType).toBe('short')
    expect(item.excerpt).toBe('本文')
    expect(item.publishedAt).toBe('2026-09-15T00:00:00.000Z')
    expect(item.author.displayName).toBe('たろう')
    expect(item.image).toBeNull()
  })

  it('画像は先頭の1件だけを使う（埋め込み側で1件に絞って取る）', () => {
    const item = toPostListItem(
      { ...row, post_images: [{ storage_path: 'a/b/first.webp', alt_text: null }] },
      toUrl,
    )
    expect(item.image).toEqual({ url: 'https://example.test/a/b/first.webp', altText: '' })
  })

  it('published_at が無い行は created_at で代替する', () => {
    const item = toPostListItem({ ...row, published_at: null }, toUrl)
    expect(item.publishedAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('作者が消えた行でも表示名を用意する', () => {
    const item = toPostListItem({ ...row, author: null }, toUrl)
    expect(item.author.displayName).toBe('退会したユーザー')
    expect(item.author.username).toBe('')
  })

  it('解決できなかったタグ（null）は落とす', () => {
    const item = toPostListItem(
      {
        ...row,
        post_tags: [
          { tags: { id: 't1', slug: 'morning-cafe', label: '朝カフェ' } },
          { tags: null },
        ],
      },
      toUrl,
    )
    expect(item.tags).toHaveLength(1)
  })

  it('未知の post_type は短文として扱う', () => {
    expect(toPostListItem({ ...row, post_type: 'unknown' }, toUrl).postType).toBe('short')
  })
})
