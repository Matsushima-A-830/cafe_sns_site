import { describe, expect, it } from 'vitest'
import { aggregateTagCounts, buildWeekBuckets, sortWeekdayCongestion } from './analytics'

describe('buildWeekBuckets', () => {
  it('直近 weeks 週分を古い順に、境界なく連続したバケットで返す', () => {
    const weekStart = new Date('2026-09-21T00:00:00.000Z')
    const buckets = buildWeekBuckets(weekStart, 4)

    expect(buckets).toHaveLength(4)
    expect(buckets.at(-1)?.start.toISOString()).toBe(weekStart.toISOString())
    expect(buckets[0]?.start.toISOString()).toBe('2026-08-31T00:00:00.000Z')
    // 隙間なく連続（前バケットの end = 次バケットの start）
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i - 1]?.end.toISOString()).toBe(buckets[i]?.start.toISOString())
    }
  })

  it('weeks=1 なら現在の週だけの1バケット', () => {
    const weekStart = new Date('2026-09-21T00:00:00.000Z')
    const buckets = buildWeekBuckets(weekStart, 1)
    expect(buckets).toHaveLength(1)
    expect(buckets[0]?.start.toISOString()).toBe(weekStart.toISOString())
    expect(buckets[0]?.end.toISOString()).toBe('2026-09-28T00:00:00.000Z')
  })
})

describe('aggregateTagCounts', () => {
  it('tagId ごとに件数を集計し、多い順に並べる', () => {
    const rows = [
      { tagId: 'a', label: '朝カフェ', category: 'mood' },
      { tagId: 'b', label: 'Wi-Fi', category: 'other' },
      { tagId: 'a', label: '朝カフェ', category: 'mood' },
      { tagId: 'a', label: '朝カフェ', category: 'mood' },
      { tagId: 'b', label: 'Wi-Fi', category: 'other' },
    ]
    expect(aggregateTagCounts(rows)).toEqual([
      { tagId: 'a', label: '朝カフェ', category: 'mood', count: 3 },
      { tagId: 'b', label: 'Wi-Fi', category: 'other', count: 2 },
    ])
  })

  it('同数なら label 昇順', () => {
    const rows = [
      { tagId: 'b', label: 'ワーク', category: 'occasion' },
      { tagId: 'a', label: 'Wi-Fi', category: 'other' },
    ]
    expect(aggregateTagCounts(rows).map((t) => t.tagId)).toEqual(['a', 'b'])
  })

  it('limit で上位件数のみに絞る', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      tagId: `t${i}`,
      label: `tag${i}`,
      category: 'other',
    }))
    expect(aggregateTagCounts(rows, 10)).toHaveLength(10)
  })

  it('空配列なら空配列', () => {
    expect(aggregateTagCounts([])).toEqual([])
  })
})

describe('sortWeekdayCongestion', () => {
  it('月始まりの順に並べ替え、データが無い曜日は null/0で埋める', () => {
    const rows = [
      { day_of_week: 0, level_avg: 2.0, sample_count: 3 },
      { day_of_week: 1, level_avg: 4.5, sample_count: 10 },
    ]
    const result = sortWeekdayCongestion(rows)
    expect(result.map((r) => r.label)).toEqual(['月', '火', '水', '木', '金', '土', '日'])
    expect(result[0]).toEqual({ dayOfWeek: 1, label: '月', levelAvg: 4.5, sampleCount: 10 })
    expect(result[6]).toEqual({ dayOfWeek: 0, label: '日', levelAvg: 2.0, sampleCount: 3 })
    expect(result[1]).toEqual({ dayOfWeek: 2, label: '火', levelAvg: null, sampleCount: 0 })
  })
})
