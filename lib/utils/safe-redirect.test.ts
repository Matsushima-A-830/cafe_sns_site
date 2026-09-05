import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from './safe-redirect'

describe('safeRedirectPath', () => {
  it('同一オリジンの相対パスをそのまま返す', () => {
    expect(safeRedirectPath('/me/edit')).toBe('/me/edit')
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

  it('/ で始まらない値を拒否する', () => {
    expect(safeRedirectPath('evil.com')).toBe('/')
  })
})
