import { describe, expect, it } from 'vitest'
import { formatChangePct, pctChange, startOfJstWeek } from './dashboard'

describe('startOfJstWeek', () => {
  it('JST水曜日なら同じ週の月曜0:00(JST)を返す', () => {
    // 2026-09-23(水) JST 15:00 = 2026-09-23T06:00:00Z
    const now = new Date('2026-09-23T06:00:00.000Z')
    // 月曜0:00 JST = 前日21:00 UTC (2026-09-20T21:00:00Z)
    expect(startOfJstWeek(now).toISOString()).toBe('2026-09-20T15:00:00.000Z')
  })

  it('JST月曜0:00ちょうどならその日を返す', () => {
    const now = new Date('2026-09-20T15:00:00.000Z')
    expect(startOfJstWeek(now).toISOString()).toBe('2026-09-20T15:00:00.000Z')
  })

  it('JST日曜日は前週月曜を返す', () => {
    // 2026-09-27(日) JST 10:00 = 2026-09-27T01:00:00Z
    const now = new Date('2026-09-27T01:00:00.000Z')
    expect(startOfJstWeek(now).toISOString()).toBe('2026-09-20T15:00:00.000Z')
  })

  it('JST 0時台（UTCでは前日）も正しい暦日で判定する', () => {
    // 2026-09-21(月) JST 03:00 = 2026-09-20T18:00:00Z（UTCでは日曜日だがJSTでは月曜日）
    const now = new Date('2026-09-20T18:00:00.000Z')
    expect(startOfJstWeek(now).toISOString()).toBe('2026-09-20T15:00:00.000Z')
  })
})

describe('pctChange', () => {
  it('増加は正の整数%', () => {
    expect(pctChange(23, 20)).toBe(15)
  })

  it('減少は負の整数%', () => {
    expect(pctChange(10, 20)).toBe(-50)
  })

  it('前週0件のときは null（割合が意味を持たない）', () => {
    expect(pctChange(5, 0)).toBeNull()
    expect(pctChange(0, 0)).toBeNull()
  })

  it('四捨五入する', () => {
    expect(pctChange(21, 20)).toBe(5)
  })
})

describe('formatChangePct', () => {
  it('正の値は+を付ける', () => {
    expect(formatChangePct(15)).toBe('+15%')
  })

  it('負の値はそのまま-が付く', () => {
    expect(formatChangePct(-50)).toBe('-50%')
  })

  it('0は±0%', () => {
    expect(formatChangePct(0)).toBe('±0%')
  })

  it('nullは—', () => {
    expect(formatChangePct(null)).toBe('—')
  })
})
