import { describe, expect, it } from 'vitest'
import { loadMoreSearchSchema, parseSearchQuery, searchQuerySchema } from './search'

describe('parseSearchQuery', () => {
  it('正しい絞り込みはそのまま通す', () => {
    expect(
      parseSearchQuery({
        keyword: '渋谷 隠れ家',
        areaCode: 'JP-13-shibuya-ku',
        moodSlug: 'quiet',
        occasionSlug: 'work',
      }),
    ).toEqual({
      keyword: '渋谷 隠れ家',
      areaCode: 'JP-13-shibuya-ku',
      moodSlug: 'quiet',
      occasionSlug: 'work',
    })
  })

  it('壊れた項目だけを捨て、生きている絞り込みは残す', () => {
    // `?mood=&occasion=work` のように片方が空なだけで利用機会まで消さない
    expect(
      parseSearchQuery({ keyword: null, areaCode: null, moodSlug: '', occasionSlug: 'work' }),
    ).toEqual({ keyword: null, areaCode: null, moodSlug: null, occasionSlug: 'work' })

    expect(
      parseSearchQuery({
        keyword: null,
        areaCode: null,
        moodSlug: 'Quiet Mood', // slug の形（英小文字とハイフンのみ）を満たさない
        occasionSlug: 'work',
      }),
    ).toEqual({ keyword: null, areaCode: null, moodSlug: null, occasionSlug: 'work' })
  })

  it('空文字のキーワードは null 扱い（trim後に空になる場合も含む）', () => {
    expect(
      parseSearchQuery({ keyword: '   ', areaCode: null, moodSlug: null, occasionSlug: null })
        .keyword,
    ).toBeNull()
  })

  it('50文字を超えるキーワードは捨てる（DB保護の上限。長さに意味はない）', () => {
    const tooLong = 'あ'.repeat(51)
    expect(
      parseSearchQuery({ keyword: tooLong, areaCode: null, moodSlug: null, occasionSlug: null })
        .keyword,
    ).toBeNull()
  })
})

describe('searchQuerySchema', () => {
  it('全項目省略時は全て null', () => {
    expect(searchQuerySchema.parse({})).toEqual({
      keyword: null,
      areaCode: null,
      moodSlug: null,
      occasionSlug: null,
    })
  })

  it('areaCode の形を満たさない値は弾く', () => {
    expect(searchQuerySchema.safeParse({ areaCode: '渋谷区' }).success).toBe(false)
  })
})

describe('loadMoreSearchSchema', () => {
  it('query と cursor の組を受ける（もっと見る Server Action の入力形）', () => {
    const parsed = loadMoreSearchSchema.safeParse({
      query: { keyword: '渋谷' },
      cursor: {
        publishedAt: '2026-09-15T14:54:51.659211+00:00',
        id: '11111111-1111-4111-8111-111111111111',
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('cursor が壊れていれば弾く', () => {
    const parsed = loadMoreSearchSchema.safeParse({
      query: {},
      cursor: { publishedAt: 'not-a-date', id: 'x' },
    })
    expect(parsed.success).toBe(false)
  })
})
