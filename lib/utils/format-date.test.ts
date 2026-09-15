import { describe, expect, it } from 'vitest'
import { formatPostDate } from './format-date'

describe('formatPostDate', () => {
  it('日本時間の年月日で表示する', () => {
    expect(formatPostDate('2026-09-14T01:00:00Z')).toBe('2026年9月14日')
  })

  it('UTCでは前日でも日本時間の日付で出す', () => {
    expect(formatPostDate('2026-09-13T23:30:00Z')).toBe('2026年9月14日')
  })

  it('解釈できない値は空文字を返す', () => {
    expect(formatPostDate('not-a-date')).toBe('')
  })
})
