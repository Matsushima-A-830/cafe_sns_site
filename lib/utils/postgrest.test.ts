import { describe, expect, it } from 'vitest'
import { escapeIlikePattern, quoteOrFilterValue } from './postgrest'

describe('escapeIlikePattern', () => {
  it('LIKE のワイルドカードをリテラルにする', () => {
    expect(escapeIlikePattern('100%')).toBe('100\\%')
    expect(escapeIlikePattern('a_b')).toBe('a\\_b')
  })

  it('バックスラッシュ自体もエスケープする', () => {
    expect(escapeIlikePattern('a\\b')).toBe('a\\\\b')
  })

  it('通常の日本語はそのまま通す', () => {
    expect(escapeIlikePattern('喫茶ローレル')).toBe('喫茶ローレル')
  })
})

describe('quoteOrFilterValue', () => {
  it('値を二重引用符で囲む', () => {
    expect(quoteOrFilterValue('%渋谷%')).toBe('"%渋谷%"')
  })

  it('引用符を退避し、or フィルタの構文を閉じさせない', () => {
    expect(quoteOrFilterValue('a"b')).toBe('"a\\"b"')
  })

  it('カンマ・括弧は引用符の内側に閉じ込める（条件の継ぎ足しを防ぐ）', () => {
    expect(quoteOrFilterValue('a,id.eq.1)')).toBe('"a,id.eq.1)"')
  })
})
