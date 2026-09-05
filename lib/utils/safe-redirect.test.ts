import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from './safe-redirect'

describe('safeRedirectPath', () => {
  it('同一オリジンの相対パスをそのまま返す', () => {
    expect(safeRedirectPath('/me/edit')).toBe('/me/edit')
  })

  it('クエリ・ハッシュを保持する', () => {
    expect(safeRedirectPath('/search?q=a#top')).toBe('/search?q=a#top')
  })

  it('未指定ならフォールバックを返す', () => {
    expect(safeRedirectPath(null)).toBe('/')
    expect(safeRedirectPath(undefined, '/home')).toBe('/home')
  })

  it('プロトコル相対URL(//evil.com)を拒否する', () => {
    expect(safeRedirectPath('//evil.com')).toBe('/')
  })

  it('絶対URLを拒否する', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/')
    expect(safeRedirectPath('http://evil.com/phish')).toBe('/')
  })

  it('バックスラッシュでのオリジン偽装を拒否する（ブラウザが / として正規化するため）', () => {
    expect(safeRedirectPath('/\\evil.com')).toBe('/')
    expect(safeRedirectPath('\\\\evil.com')).toBe('/')
  })

  it('/ で始まらない値は同一オリジンの相対パスとして解決される（別オリジンには出ない）', () => {
    expect(safeRedirectPath('evil.com')).toBe('/evil.com')
  })

  it('不正なURLはフォールバックにする', () => {
    expect(safeRedirectPath('http://')).toBe('/')
  })
})
