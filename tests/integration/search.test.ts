import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getPostList } from '@/lib/posts/post-list'
import { resolveSearchOptions } from '@/lib/posts/search'
import type { SearchQuery } from '@/lib/validators/search'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// lib/posts/search.ts / post-list.ts の keyword・moodTagId・occasionTagId 絞り込みを
// 実 DB に対して動かす。確認したいのは:
//  1. moodTagId と occasionTagId を両方指定すると AND になる（片方しか持たない投稿はヒットしない）
//     — 既存の tagIds（OR）と取り違えると気づかずに絞り込みが緩くなる、S_SEARCH最大の罠
//  2. keyword が body_text だけでなく title にもヒットする
//  3. areaCode は areas 経由のまま機能する

const service = serviceRoleClient()

const bodyJson = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const BASE_TIME = Date.parse('2030-02-01T00:00:00.000Z')
const publishedAt = (offsetMinutes: number) =>
  new Date(BASE_TIME + offsetMinutes * 60_000).toISOString()

let author: AuthedUser
let moodTagId: string
let occasionTagId: string
let otherMoodTagId: string
let areaCode: string

const postIds: string[] = []

async function insertPost(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: author.userId,
    post_type: 'short',
    body_json: bodyJson('本文テキスト'),
    status: 'published',
    published_at: publishedAt(0),
    ...overrides,
  })
  if (error) throw new Error(`テスト投稿の作成に失敗: ${error.message}`)
  postIds.push(id)
  return id
}

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

const query = (overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  keyword: null,
  areaCode: null,
  moodSlug: null,
  occasionSlug: null,
  ...overrides,
})

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'author_search', display_name: '著者' })

  const { data: moodTags } = await service
    .from('tags')
    .select('id')
    .eq('category', 'mood')
    .eq('is_curated', true)
    .order('slug')
    .limit(2)
  if (!moodTags || moodTags.length < 2) throw new Error('mood タグが2件以上 seed されていない')
  moodTagId = moodTags[0]?.id as string
  otherMoodTagId = moodTags[1]?.id as string

  const { data: occasionTags } = await service
    .from('tags')
    .select('id')
    .eq('category', 'occasion')
    .eq('is_curated', true)
    .limit(1)
  if (!occasionTags || occasionTags.length < 1) throw new Error('occasion タグが seed されていない')
  occasionTagId = occasionTags[0]?.id as string

  const { data: area } = await service
    .from('areas')
    .select('code')
    .eq('level', 'ward')
    .limit(1)
    .single()
  if (!area) throw new Error('areas が seed されていない')
  areaCode = area.code as string
})

afterEach(async () => {
  if (postIds.length > 0) {
    await service.from('posts').delete().in('id', postIds)
    postIds.length = 0
  }
})

afterAll(async () => {
  await author?.cleanup()
})

describe('getPostList の moodTagId / occasionTagId 絞り込み', () => {
  it('両方のタグを持つ投稿だけがヒットする（AND）', async () => {
    const both = await insertPost({ published_at: publishedAt(10) })
    const moodOnly = await insertPost({ published_at: publishedAt(10) })
    const occasionOnly = await insertPost({ published_at: publishedAt(10) })
    const neither = await insertPost({ published_at: publishedAt(10) })

    await service.from('post_tags').insert([
      { post_id: both, tag_id: moodTagId },
      { post_id: both, tag_id: occasionTagId },
      { post_id: moodOnly, tag_id: moodTagId },
      { post_id: occasionOnly, tag_id: occasionTagId },
    ])

    const page = await getPostList(typed(anonClient()), { moodTagId, occasionTagId })
    const ids = page.items.map((post) => post.id)

    expect(ids).toContain(both)
    expect(ids).not.toContain(moodOnly)
    expect(ids).not.toContain(occasionOnly)
    expect(ids).not.toContain(neither)
  })

  it('片方だけ持つ投稿は、その片方のタグだけを指定すればヒットする（既存 tagIds のOR感覚と混同しない回帰確認）', async () => {
    const moodOnly = await insertPost({ published_at: publishedAt(10) })
    await service.from('post_tags').insert({ post_id: moodOnly, tag_id: otherMoodTagId })

    const page = await getPostList(typed(anonClient()), { moodTagId: otherMoodTagId })
    expect(page.items.map((post) => post.id)).toContain(moodOnly)
  })
})

describe('getPostList の keyword 絞り込み', () => {
  it('本文(body_text)にヒットする', async () => {
    const matched = await insertPost({
      body_json: bodyJson('渋谷の隠れ家カフェでゆっくりしました'),
      published_at: publishedAt(20),
    })
    const unmatched = await insertPost({ published_at: publishedAt(20) })

    const page = await getPostList(typed(anonClient()), { keyword: '隠れ家' })
    const ids = page.items.map((post) => post.id)

    expect(ids).toContain(matched)
    expect(ids).not.toContain(unmatched)
  })

  it('本文に無くても title にヒットする（落とし穴3: body_textにはtitleが連結されない）', async () => {
    const matched = await insertPost({
      post_type: 'blog',
      title: '早朝営業のブックカフェ特集',
      published_at: publishedAt(20),
    })
    const unmatched = await insertPost({ published_at: publishedAt(20) })

    const page = await getPostList(typed(anonClient()), { keyword: 'ブックカフェ' })
    const ids = page.items.map((post) => post.id)

    expect(ids).toContain(matched)
    expect(ids).not.toContain(unmatched)
  })
})

describe('getPostList の areaCode 絞り込み（S_SEARCH でも areas 経由のまま）', () => {
  it('カフェのエリアで絞り込める', async () => {
    const { data: cafe, error } = await service
      .from('cafes')
      .insert({
        name: 'テスト珈琲店（検索）',
        prefecture: '東京都',
        city: '渋谷区',
        area_code: areaCode,
        created_by: author.userId,
      })
      .select('id')
      .single()
    if (error || !cafe) throw new Error(`テストカフェの作成に失敗: ${error?.message}`)

    const withCafe = await insertPost({ cafe_id: cafe.id, published_at: publishedAt(30) })
    const withoutCafe = await insertPost({ published_at: publishedAt(30) })

    const page = await getPostList(typed(anonClient()), { areaCode })
    const ids = page.items.map((post) => post.id)

    expect(ids).toContain(withCafe)
    expect(ids).not.toContain(withoutCafe)

    await service.from('cafes').delete().eq('id', cafe.id)
  })
})

describe('resolveSearchOptions', () => {
  it('mood/occasion slug を id に解決し、両方 options に乗る', async () => {
    const { data: moodTag } = await service.from('tags').select('slug').eq('id', moodTagId).single()
    const { data: occasionTag } = await service
      .from('tags')
      .select('slug')
      .eq('id', occasionTagId)
      .single()

    const resolved = await resolveSearchOptions(
      typed(anonClient()),
      query({ moodSlug: moodTag?.slug as string, occasionSlug: occasionTag?.slug as string }),
      null,
    )

    expect(resolved?.options.moodTagId).toBe(moodTagId)
    expect(resolved?.options.occasionTagId).toBe(occasionTagId)
  })

  it('存在しない mood slug は null（0件確定）', async () => {
    const resolved = await resolveSearchOptions(
      typed(anonClient()),
      query({ moodSlug: 'no-such-tag' }),
      null,
    )
    expect(resolved).toBeNull()
  })

  it('存在しない occasion slug は null（0件確定）', async () => {
    const resolved = await resolveSearchOptions(
      typed(anonClient()),
      query({ occasionSlug: 'no-such-tag' }),
      null,
    )
    expect(resolved).toBeNull()
  })

  it('category が一致しない slug（mood 用の欄に occasion のタグ）は null 扱い', async () => {
    const { data: occasionTag } = await service
      .from('tags')
      .select('slug')
      .eq('id', occasionTagId)
      .single()

    const resolved = await resolveSearchOptions(
      typed(anonClient()),
      query({ moodSlug: occasionTag?.slug as string }),
      null,
    )
    expect(resolved).toBeNull()
  })
})
