import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getNearbyCafes } from '@/lib/cafes/nearby'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// nearby_cafes（RPC）と lib/cafes/nearby.ts を実DBに対して動かす。確認したいのは:
//  1. 距離順（近い順）に並ぶこと
//  2. location が NULL のカフェは出ないこと
//  3. area_code / query の絞り込みが効くこと
//  4. security invoker のため、未ログインでも closed / hidden は RLS で落ちること
//  5. 境界の入力検証（lat/lng の範囲外）で例外にならず空配列になること
//  6. moodTag / occasionTag の絞り込みが効くこと（D63: 該当カテゴリのタグが付いた
//     公開投稿を1件以上持つカフェのみ）。非公開（hidden）投稿のタグは一致に使われないこと
//  7. posts_select_own（本人には status/deleted_at を問わず見せる permissive policy）が
//     タグ絞り込みのEXISTSにまで滲み出さないこと — 投稿者本人のセッションで実行しても、
//     自分の hidden 投稿のタグはヒット条件に使われない（code-review指摘の回帰防止）

const service = serviceRoleClient()
const anon = anonClient()

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

// 渋谷駅を原点に、南北で距離差をつける
const SHIBUYA = { lat: 35.658, lng: 139.7016 }
const point = (lat: number, lng: number) => `SRID=4326;POINT(${lng} ${lat})`

const cafeIds: string[] = []

async function insertCafe(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: 'テスト珈琲店', prefecture: '東京都', city: '渋谷区', ...overrides })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id
}

let nearCafeId: string
let farCafeId: string
let noLocationCafeId: string
let closedNearbyCafeId: string
let hiddenNearbyCafeId: string
let otherAreaCafeId: string
let quietMoodCafeId: string
let workOccasionCafeId: string
let hiddenTaggedCafeId: string

let poster: AuthedUser
const postIds: string[] = []
const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'タグ絞り込みテスト投稿' }] }],
}

async function insertTaggedPost(cafeId: string, tagSlug: string, status = 'published') {
  const { data: tag, error: tagError } = await service
    .from('tags')
    .select('id')
    .eq('slug', tagSlug)
    .single()
  if (tagError || !tag)
    throw new Error(`タグ ${tagSlug} が seed されていない: ${tagError?.message}`)

  const { data: post, error: postError } = await service
    .from('posts')
    .insert({
      author_id: poster.userId,
      cafe_id: cafeId,
      post_type: 'short',
      body_json: bodyJson,
      status,
    })
    .select('id')
    .single()
  if (postError || !post) throw new Error(`テスト投稿の作成に失敗: ${postError?.message}`)
  postIds.push(post.id)

  const { error: tagLinkError } = await service
    .from('post_tags')
    .insert({ post_id: post.id, tag_id: tag.id })
  if (tagLinkError) throw new Error(`post_tags の作成に失敗: ${tagLinkError.message}`)
}

beforeAll(async () => {
  poster = await createAuthedProfile({ username: 'nearby_tag_poster' })

  nearCafeId = await insertCafe({
    name: '渋谷駅前カフェ',
    area_code: 'JP-13-shibuya-ku',
    location: point(35.659, 139.702),
  })
  farCafeId = await insertCafe({
    name: '新宿の遠いカフェ',
    area_code: 'JP-13-shibuya-ku',
    location: point(35.69, 139.7),
  })
  noLocationCafeId = await insertCafe({ name: '座標未収集のカフェ', area_code: 'JP-13-shibuya-ku' })
  closedNearbyCafeId = await insertCafe({
    name: '閉店した近くの店',
    area_code: 'JP-13-shibuya-ku',
    status: 'closed',
    location: point(35.6585, 139.7018),
  })
  hiddenNearbyCafeId = await insertCafe({
    name: '非公開の近くの店',
    area_code: 'JP-13-shibuya-ku',
    status: 'hidden',
    location: point(35.6585, 139.7018),
  })
  otherAreaCafeId = await insertCafe({
    name: '渋谷駅前カフェ別館',
    area_code: 'JP-13-shinjuku-ku',
    location: point(35.6585, 139.7018),
  })
  quietMoodCafeId = await insertCafe({
    name: '静かな店タグ付き',
    area_code: 'JP-13-shibuya-ku',
    location: point(35.6585, 139.7018),
  })
  workOccasionCafeId = await insertCafe({
    name: 'ワーク向けタグ付き',
    area_code: 'JP-13-shibuya-ku',
    location: point(35.6585, 139.7018),
  })
  hiddenTaggedCafeId = await insertCafe({
    name: 'タグは付くが投稿が非公開',
    area_code: 'JP-13-shibuya-ku',
    location: point(35.6585, 139.7018),
  })

  await insertTaggedPost(quietMoodCafeId, 'quiet')
  await insertTaggedPost(workOccasionCafeId, 'work')
  await insertTaggedPost(hiddenTaggedCafeId, 'quiet', 'hidden')
})

afterAll(async () => {
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  if (cafeIds.length > 0) await service.from('cafes').delete().in('id', cafeIds)
  await poster.cleanup()
})

describe('getNearbyCafes', () => {
  it('座標のあるカフェだけを距離順（近い順）で返す', async () => {
    const result = await getNearbyCafes(typed(anon), SHIBUYA)
    const ids = result.map((r) => r.cafeId)

    expect(ids).not.toContain(noLocationCafeId)
    const nearIndex = ids.indexOf(nearCafeId)
    const farIndex = ids.indexOf(farCafeId)
    expect(nearIndex).toBeGreaterThanOrEqual(0)
    expect(farIndex).toBeGreaterThan(nearIndex)
  })

  it('closed / hidden は RLS で落ちる（未ログインでも security invoker のまま漏れない）', async () => {
    const result = await getNearbyCafes(typed(anon), SHIBUYA)
    const ids = result.map((r) => r.cafeId)

    expect(ids).not.toContain(closedNearbyCafeId)
    expect(ids).not.toContain(hiddenNearbyCafeId)
  })

  it('area_code で絞り込める', async () => {
    const result = await getNearbyCafes(typed(anon), { ...SHIBUYA, areaCode: 'JP-13-shinjuku-ku' })
    const ids = result.map((r) => r.cafeId)

    expect(ids).toEqual([otherAreaCafeId])
  })

  it('query（カフェ名の部分一致）で絞り込める', async () => {
    const result = await getNearbyCafes(typed(anon), { ...SHIBUYA, query: '駅前カフェ' })
    const ids = result.map((r) => r.cafeId)

    expect(ids).toContain(nearCafeId)
    expect(ids).toContain(otherAreaCafeId)
    expect(ids).not.toContain(farCafeId)
  })

  it('lat/lng が範囲外なら空配列を返す（例外にしない）', async () => {
    expect(await getNearbyCafes(typed(anon), { lat: 999, lng: 139.7 })).toEqual([])
  })

  it('area_label・distance_m・is_verified を含む', async () => {
    const result = await getNearbyCafes(typed(anon), SHIBUYA)
    const near = result.find((r) => r.cafeId === nearCafeId)

    expect(near).toMatchObject({ areaLabel: '渋谷区', isVerified: false })
    expect(near?.distanceM).toBeGreaterThanOrEqual(0)
  })

  it('moodTag で絞り込める（該当カテゴリのタグが付いた公開投稿を持つカフェのみ）', async () => {
    const result = await getNearbyCafes(typed(anon), { ...SHIBUYA, moodTag: 'quiet' })
    const ids = result.map((r) => r.cafeId)

    expect(ids).toContain(quietMoodCafeId)
    expect(ids).not.toContain(workOccasionCafeId)
    expect(ids).not.toContain(nearCafeId)
  })

  it('occasionTag で絞り込める', async () => {
    const result = await getNearbyCafes(typed(anon), { ...SHIBUYA, occasionTag: 'work' })
    const ids = result.map((r) => r.cafeId)

    expect(ids).toContain(workOccasionCafeId)
    expect(ids).not.toContain(quietMoodCafeId)
  })

  it('非公開（hidden）投稿に付いたタグは絞り込みに使われない', async () => {
    const result = await getNearbyCafes(typed(anon), { ...SHIBUYA, moodTag: 'quiet' })
    const ids = result.map((r) => r.cafeId)

    expect(ids).not.toContain(hiddenTaggedCafeId)
  })

  it('投稿者本人のセッションでも、自分の非公開投稿のタグは絞り込みに使われない', async () => {
    // posts_select_own は author_id 一致のみで status/deleted_at を見ない permissive policy。
    // RLS 任せだと本人のセッションからは hidden 投稿越しにカフェがヒットしてしまう
    const result = await getNearbyCafes(typed(poster.client), { ...SHIBUYA, moodTag: 'quiet' })
    const ids = result.map((r) => r.cafeId)

    expect(ids).not.toContain(hiddenTaggedCafeId)
  })

  it('moodTag と occasionTag を同時に指定すると両方を満たすカフェのみ返る', async () => {
    const result = await getNearbyCafes(typed(anon), {
      ...SHIBUYA,
      moodTag: 'quiet',
      occasionTag: 'work',
    })
    const ids = result.map((r) => r.cafeId)

    expect(ids).not.toContain(quietMoodCafeId)
    expect(ids).not.toContain(workOccasionCafeId)
  })
})
