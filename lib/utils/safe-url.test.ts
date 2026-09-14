import { describe, expect, it } from 'vitest'
import { safeHttpUrl } from './safe-url'

describe('safeHttpUrl', () => {
  it('http / https はそのまま返す', () => {
    expect(safeHttpUrl('https://example.com/a.webp')).toBe('https://example.com/a.webp')
    expect(safeHttpUrl('http://127.0.0.1:54321/x')).toBe('http://127.0.0.1:54321/x')
  })

  it('それ以外のスキーム・相対パス・非文字列は null', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:image/png;base64,AAAA')).toBeNull()
    expect(safeHttpUrl('/posts/1')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl(42)).toBeNull()
  })
})
