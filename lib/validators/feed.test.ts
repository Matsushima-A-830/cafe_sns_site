import { describe, expect, it } from 'vitest'
import { feedCursorSchema, parseFeedQuery } from './feed'

describe('parseFeedQuery', () => {
  it('正しい絞り込みはそのまま通す', () => {
    expect(
      parseFeedQuery({ scope: 'new', tagSlug: 'morning-cafe', areaCode: 'JP-13-shibuya-ku' }),
    ).toEqual({ scope: 'new', tagSlug: 'morning-cafe', areaCode: 'JP-13-shibuya-ku' })
  })

  it('壊れた項目だけを捨て、生きている絞り込みは残す', () => {
    // `?tag=&area=JP-13-shibuya-ku` のように片方が空なだけでエリアまで消さない
    expect(parseFeedQuery({ scope: 'new', tagSlug: '', areaCode: 'JP-13-shibuya-ku' })).toEqual({
      scope: 'new',
      tagSlug: null,
      areaCode: 'JP-13-shibuya-ku',
    })

    expect(
      parseFeedQuery({ scope: 'new', tagSlug: 'Morning Cafe', areaCode: 'JP-13-shibuya-ku' }),
    ).toEqual({ scope: 'new', tagSlug: null, areaCode: 'JP-13-shibuya-ku' })
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
