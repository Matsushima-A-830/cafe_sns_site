import { describe, expect, it } from 'vitest'
import { postDescription, postDisplayTitle, postPlainText, toPostDetail } from './post-detail'

const bodyJson = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '表参道の喫茶店に行った' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '静かで集中できる' }] },
  ],
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    post_type: 'short',
    title: null,
    body_json: bodyJson,
    visibility: 'public',
    published_at: '2026-09-14T01:00:00Z',
    created_at: '2026-09-14T00:00:00Z',
    like_count: 0,
    comment_count: 0,
    author: {
      id: 'user-1',
      username: 'kaho',
      display_name: 'かほ',
      avatar_url: null,
    },
    cafe: null,
    post_images: [],
    post_tags: [],
    ...overrides,
  }
}

const publicUrl = (path: string) => `https://cdn.example.com/${path}`

describe('postPlainText', () => {
  it('Tiptap JSON からテキストだけを取り出し、連続する空白を1つに畳む', () => {
    expect(postPlainText(bodyJson)).toBe('表参道の喫茶店に行った 静かで集中できる')
  })

  it('本文が空・不正でも空文字を返す', () => {
    expect(postPlainText(null)).toBe('')
    expect(postPlainText({ type: 'doc', content: [] })).toBe('')
  })
})

describe('postDisplayTitle', () => {
  it('タイトルがあればそのまま使う', () => {
    expect(postDisplayTitle('雨の日の喫茶店', bodyJson)).toBe('雨の日の喫茶店')
  })

  it('タイトルが無ければ本文の冒頭を使う', () => {
    expect(postDisplayTitle(null, bodyJson)).toBe('表参道の喫茶店に行った 静かで集中できる')
  })

  it('本文が長ければ30字で切って省略記号を付ける', () => {
    const long = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'あ'.repeat(50) }] }],
    }
    const title = postDisplayTitle(null, long)
    expect(title).toBe(`${'あ'.repeat(30)}…`)
  })

  it('タイトルも本文も無ければ既定の文言を返す', () => {
    expect(postDisplayTitle(null, null)).toBe('投稿')
  })

  it('タイトルも本文も無いとき、渡された代替文言を使う（写真だけの投稿）', () => {
    expect(postDisplayTitle(null, null, 'かほさんの投稿')).toBe('かほさんの投稿')
  })
})

describe('postDescription', () => {
  it('本文の冒頭120字を返す', () => {
    const long = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'い'.repeat(200) }] }],
    }
    expect(postDescription(long)).toBe(`${'い'.repeat(120)}…`)
  })

  it('120字以下なら省略記号を付けない', () => {
    expect(postDescription(bodyJson)).toBe('表参道の喫茶店に行った 静かで集中できる')
  })
})

describe('toPostDetail', () => {
  it('画像を display_order 順に並べ、公開URLへ変換する', () => {
    const detail = toPostDetail(
      row({
        post_images: [
          { storage_path: 'u/p/b.webp', alt_text: null, display_order: 1 },
          { storage_path: 'u/p/a.webp', alt_text: 'ラテ', display_order: 0 },
        ],
      }),
      publicUrl,
    )
    expect(detail.images.map((image) => image.url)).toEqual([
      'https://cdn.example.com/u/p/a.webp',
      'https://cdn.example.com/u/p/b.webp',
    ])
    expect(detail.images[0]?.altText).toBe('ラテ')
    expect(detail.images[1]?.altText).toBe('')
  })

  it('タグを平坦化し、欠けた行は落とす', () => {
    const detail = toPostDetail(
      row({
        post_tags: [{ tags: { id: 't1', slug: 'morning', label: '朝カフェ' } }, { tags: null }],
      }),
      publicUrl,
    )
    expect(detail.tags).toEqual([{ id: 't1', slug: 'morning', label: '朝カフェ' }])
  })

  it('カフェとエリアを取り込む', () => {
    const detail = toPostDetail(
      row({
        cafe: {
          id: 'cafe-1',
          name: 'ブルーボトル',
          area_code: 'shibuya',
          areas: { label: '渋谷' },
        },
      }),
      publicUrl,
    )
    expect(detail.cafe).toEqual({ id: 'cafe-1', name: 'ブルーボトル', areaLabel: '渋谷' })
  })

  it('post_type が未知の値なら short として扱う', () => {
    expect(toPostDetail(row({ post_type: 'unknown' }), publicUrl).postType).toBe('short')
  })

  it('published_at が無ければ created_at を表示日時に使う', () => {
    const detail = toPostDetail(row({ published_at: null }), publicUrl)
    expect(detail.publishedAt).toBe('2026-09-14T00:00:00Z')
  })
})
