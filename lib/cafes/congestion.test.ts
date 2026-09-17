import { describe, expect, it } from 'vitest'
import { congestionLabel, congestionLevel, toCongestionSummary } from './congestion'

describe('toCongestionSummary', () => {
  it('直近30分のデータを recent として返す', () => {
    expect(toCongestionSummary({ level_avg: 3.5, source: 'recent', sample_count: 3 })).toEqual({
      source: 'recent',
      levelAvg: 3.5,
      sampleCount: 3,
    })
  })

  it('過去4週間のデータを historical として返す', () => {
    expect(toCongestionSummary({ level_avg: 2, source: 'historical', sample_count: 12 })).toEqual({
      source: 'historical',
      levelAvg: 2,
      sampleCount: 12,
    })
  })

  it('source=none はデータなしにする', () => {
    expect(toCongestionSummary({ level_avg: null, source: 'none', sample_count: 0 })).toEqual({
      source: 'none',
      levelAvg: null,
      sampleCount: 0,
    })
  })

  it('level_avg が NULL なら source に関わらずデータなしにする', () => {
    // 型は non-nullable だが実際に NULL が来る（RETURNS TABLE の生成型は信用できない）
    expect(toCongestionSummary({ level_avg: null, source: 'recent', sample_count: 1 })).toEqual({
      source: 'none',
      levelAvg: null,
      sampleCount: 0,
    })
  })

  it('行が無ければデータなしにする', () => {
    expect(toCongestionSummary(undefined)).toEqual({
      source: 'none',
      levelAvg: null,
      sampleCount: 0,
    })
  })

  it('知らない source はデータなしに寄せる', () => {
    expect(toCongestionSummary({ level_avg: 3, source: 'future', sample_count: 5 })).toEqual({
      source: 'none',
      levelAvg: null,
      sampleCount: 0,
    })
  })
})

describe('congestionLevel', () => {
  it('平均を四捨五入して1段階に落とす', () => {
    expect(congestionLevel(3.5)).toBe(4)
    expect(congestionLevel(2.4)).toBe(2)
  })

  it('1〜5 の外には出さない', () => {
    expect(congestionLevel(0.2)).toBe(1)
    expect(congestionLevel(9)).toBe(5)
  })

  it('データなしは null', () => {
    expect(congestionLevel(null)).toBeNull()
  })
})

describe('congestionLabel', () => {
  it('段階に応じた日本語を返す', () => {
    expect(congestionLabel(1)).toBe('空いている')
    expect(congestionLabel(4.6)).toBe('混んでいる')
  })

  it('データなしは null', () => {
    expect(congestionLabel(null)).toBeNull()
  })
})
