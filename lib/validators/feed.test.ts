import { describe, expect, it } from 'vitest'
import { feedCursorSchema, feedQuerySchema, parseFeedQuery } from './feed'

describe('parseFeedQuery', () => {
  it('正しい絞り込みはそのまま通す', () => {
    expect(
      parseFeedQuery({ scope: 'new', tagSlug: 'morning-cafe', areaCode: 'JP-13-shibuya-ku' }),
    ).toEqual({
      scope: 'new',
      tagSlug: 'morning-cafe',
      areaCode: 'JP-13-shibuya-ku',
      authorUsername: null,
      cafeId: null,
    })
  })

  it('壊れた項目だけを捨て、生きている絞り込みは残す', () => {
    // `?tag=&area=JP-13-shibuya-ku` のように片方が空なだけでエリアまで消さない
    expect(parseFeedQuery({ scope: 'new', tagSlug: '', areaCode: 'JP-13-shibuya-ku' })).toEqual({
      scope: 'new',
      tagSlug: null,
      areaCode: 'JP-13-shibuya-ku',
      authorUsername: null,
      cafeId: null,
    })

    expect(
      parseFeedQuery({ scope: 'new', tagSlug: 'Morning Cafe', areaCode: 'JP-13-shibuya-ku' }),
    ).toEqual({
      scope: 'new',
      tagSlug: null,
      areaCode: 'JP-13-shibuya-ku',
      authorUsername: null,
      cafeId: null,
    })
  })

  // 作者の絞り込みはルートパラメータ由来のものだけ。URL クエリから拾うと、
  // 壊れた値を null に丸めた瞬間に絞り込みが外れて全件になる
  it('URL クエリから作者・カフェの絞り込みは拾わない', () => {
    const query = parseFeedQuery({
      scope: 'new',
      tagSlug: null,
      areaCode: null,
      authorUsername: 'kaho',
      cafeId: crypto.randomUUID(),
    } as Parameters<typeof parseFeedQuery>[0])

    expect(query.authorUsername).toBeNull()
    expect(query.cafeId).toBeNull()
  })
})

describe('feedQuerySchema の authorUsername', () => {
  const base = { scope: 'new', tagSlug: null, areaCode: null }

  it('username の形を満たさない値は弾く（「もっと見る」の入力経路）', () => {
    for (const authorUsername of ['a', 'bad name!', 'x'.repeat(21)]) {
      expect(feedQuerySchema.safeParse({ ...base, authorUsername }).success).toBe(false)
    }
  })

  it('省略時は null', () => {
    expect(feedQuerySchema.parse(base).authorUsername).toBeNull()
  })
})

describe('feedQuerySchema の cafeId', () => {
  const base = { scope: 'new', tagSlug: null, areaCode: null }

  it('UUID でない値は弾く（「もっと見る」の入力経路）', () => {
    for (const cafeId of ['', 'not-a-uuid', '1234']) {
      expect(feedQuerySchema.safeParse({ ...base, cafeId }).success).toBe(false)
    }
  })

  it('省略時は null', () => {
    expect(feedQuerySchema.parse(base).cafeId).toBeNull()
  })
})

describe('feedCursorSchema', () => {
  it('PostgREST が返すマイクロ秒つき timestamptz を受ける', () => {
    expect(
      feedCursorSchema.safeParse({
        publishedAt: '2026-09-15T14:54:51.659211+00:00',
        id: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true)
  })

  it('PostgREST の or 句を壊せる値は弾く', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    for (const publishedAt of ['2026-09-15', 'now()', '2026-09-15T00:00:00.000Z,and(x)']) {
      expect(feedCursorSchema.safeParse({ publishedAt, id }).success).toBe(false)
    }
    expect(
      feedCursorSchema.safeParse({ publishedAt: '2026-09-15T00:00:00Z', id: 'x,y)' }).success,
    ).toBe(false)
  })
})
