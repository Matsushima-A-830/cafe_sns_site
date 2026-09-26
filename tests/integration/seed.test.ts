import { describe, expect, it } from 'vitest'
import { serviceRoleClient } from '../helpers/supabase'

// 前提: `pnpm db:reset` 直後の状態。
// マスタは seed.sql ではなく 20260905120400_seed_master_data.sql が投入する
const service = serviceRoleClient()

// docs/seed/badges-initial-set.md で確定した criteria の type 一覧
const BADGE_CRITERIA_TYPES = [
  'post_count',
  'post_count_with_tag',
  'post_count_with_tags_or',
  'distinct_scene_tag_count',
  'distinct_area_count',
  'regular_customer_count',
  'follower_count',
  'likes_received',
  'likes_given',
]

describe('areas の seed', () => {
  it('東京45エリア（23区 + 副地域22）が投入されている', async () => {
    const { data, error } = await service.from('areas').select('code, level')

    expect(error).toBeNull()
    expect(data).toHaveLength(45)
    expect(data?.filter((a) => a.level === 'ward')).toHaveLength(23)
    expect(data?.filter((a) => a.level === 'sub_area')).toHaveLength(22)
  })

  it('23区は prefecture_code=JP-13 / parent_code=NULL / priority=50', async () => {
    const { data, error } = await service
      .from('areas')
      .select('prefecture_code, parent_code, priority')
      .eq('level', 'ward')

    expect(error).toBeNull()
    expect(data?.every((a) => a.prefecture_code === 'JP-13')).toBe(true)
    expect(data?.every((a) => a.parent_code === null)).toBe(true)
    expect(data?.every((a) => a.priority === 50)).toBe(true)
  })

  it('副地域の親は 23区、ただし吉祥寺だけ 23区外なので NULL', async () => {
    const { data, error } = await service
      .from('areas')
      .select('code, parent_code')
      .eq('level', 'sub_area')

    expect(error).toBeNull()
    const orphans = data?.filter((a) => a.parent_code === null).map((a) => a.code)
    expect(orphans).toEqual(['JP-13-kichijoji'])
  })

  it('座標45件が投入されている（pending-items A3 解消済み）', async () => {
    const { count, error } = await service
      .from('areas')
      .select('code', { count: 'exact', head: true })
      .not('center_location', 'is', null)

    expect(error).toBeNull()
    expect(count).toBe(45)
  })

  it('原宿と神宮前は座標が重複しない（同一問い合わせで同座標になった実バグの再発防止）', async () => {
    const { data: rows, error } = await service
      .from('areas')
      .select('code, center_location')
      .in('code', ['JP-13-harajuku', 'JP-13-jingumae'])

    expect(error).toBeNull()
    expect(rows).toHaveLength(2)
    const [a, b] = rows ?? []
    expect(a?.center_location).not.toBeNull()
    expect(b?.center_location).not.toBeNull()
    expect(a?.center_location).not.toEqual(b?.center_location)
  })
})

describe('tags の seed', () => {
  it('厳選タグ30件が occasion15 / mood10 / other5 で投入されている', async () => {
    const { data, error } = await service
      .from('tags')
      .select('category, priority')
      .eq('is_curated', true)

    expect(error).toBeNull()
    expect(data).toHaveLength(30)
    expect(data?.filter((t) => t.category === 'occasion')).toHaveLength(15)
    expect(data?.filter((t) => t.category === 'mood')).toHaveLength(10)
    expect(data?.filter((t) => t.category === 'other')).toHaveLength(5)
  })

  it('priority は category ごとに 100 / 50 / 10 の3値のみ', async () => {
    const { data, error } = await service
      .from('tags')
      .select('category, priority')
      .eq('is_curated', true)

    expect(error).toBeNull()
    const byCategory = { occasion: 100, mood: 50, other: 10 } as const
    for (const tag of data ?? []) {
      expect(tag.priority).toBe(byCategory[tag.category as keyof typeof byCategory])
    }
  })

  it('エリアはマスタ側が正なので area カテゴリのタグは作らない', async () => {
    const { count, error } = await service
      .from('tags')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'area')

    expect(error).toBeNull()
    expect(count).toBe(0)
  })
})

describe('badges の seed', () => {
  it('20件が投入されている', async () => {
    const { count, error } = await service
      .from('badges')
      .select('id', { count: 'exact', head: true })

    expect(error).toBeNull()
    expect(count).toBe(20)
  })

  it('criteria が既知の type と正の threshold を持つ', async () => {
    const { data, error } = await service.from('badges').select('code, criteria')

    expect(error).toBeNull()
    for (const badge of data ?? []) {
      const criteria = badge.criteria as { type: string; threshold: number }
      expect(BADGE_CRITERIA_TYPES, `${badge.code} の type`).toContain(criteria.type)
      expect(criteria.threshold, `${badge.code} の threshold`).toBeGreaterThan(0)
    }
  })

  it('シーン系の tag_slug が実在する厳選タグを指す', async () => {
    const { data: badges } = await service
      .from('badges')
      .select('code, criteria')
      .like('code', 'SCENE_%')
    const { data: tags } = await service.from('tags').select('slug').eq('is_curated', true)
    const curatedSlugs = new Set((tags ?? []).map((t) => t.slug))

    const referenced = (badges ?? []).flatMap((badge) => {
      const criteria = badge.criteria as { tag_slug?: string; tag_slugs?: string[] }
      return criteria.tag_slugs ?? (criteria.tag_slug ? [criteria.tag_slug] : [])
    })

    expect(referenced.length).toBeGreaterThan(0)
    for (const slug of referenced) {
      expect(curatedSlugs, `SCENE_* が参照するタグ ${slug}`).toContain(slug)
    }
  })
})
