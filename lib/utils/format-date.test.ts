import { describe, expect, it } from 'vitest'
import { formatPostDate, formatRelativeTime } from './format-date'

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

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-20T12:00:00Z')

  it('数秒前は「数秒前」', () => {
    expect(formatRelativeTime('2026-09-20T11:59:50Z', now)).toBe('10 秒前')
  })

  it('分単位', () => {
    expect(formatRelativeTime('2026-09-20T11:58:00Z', now)).toBe('2 分前')
  })

  it('時間単位', () => {
    expect(formatRelativeTime('2026-09-20T10:00:00Z', now)).toBe('2 時間前')
  })

  it('日単位', () => {
    expect(formatRelativeTime('2026-09-18T12:00:00Z', now)).toBe('2 日前')
  })

  it('解釈できない値は空文字を返す', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('')
  })
})
