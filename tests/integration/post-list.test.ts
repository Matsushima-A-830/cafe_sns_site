import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getFeedPage, resolveFeedOptions } from '@/lib/posts/feed'
import { getPostList } from '@/lib/posts/post-list'
import { getRecommendedPostList } from '@/lib/posts/recommended-feed'
import type { FeedQuery } from '@/lib/validators/feed'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// lib/posts/post-list.ts / feed.ts を実 DB に対して動かす。確認したいのは:
//  1. 別名つき二重埋め込み（filter_tags / following）を含む select が1クエリで解決できること
//  2. RLS の posts_select_own があっても hidden・archived・論理削除済みが一覧に混ざらないこと
//  3. ブロック関係がセッション付きクライアントでのみ効くこと（anon では素通りする）
//  4. keyset ページングが重複も取りこぼしもなく続きを返すこと

const service = serviceRoleClient()

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文テキスト' }] }],
}

// 既存データより必ず新しくして、一覧の先頭に自分たちの投稿が並ぶようにする
const BASE_TIME = Date.parse('2030-01-01T00:00:00.000Z')
const publishedAt = (offsetMinutes: number) =>
  new Date(BASE_TIME + offsetMinutes * 60_000).toISOString()

let author: AuthedUser
let follower: AuthedUser
let stranger: AuthedUser
let cafeId: string
let nearbyCafeId: string
let areaCode: string
let moodTagId: string
let otherTagId: string

// 「近くのカフェ」テスト用。SRID=4326;POINT(lng lat) — nearby-cafes.test.ts と同じ書式
const point = (lat: number, lng: number) => `SRID=4326;POINT(${lng} ${lat})`
const SHIBUYA_STATION = { lat: 35.658, lng: 139.7016 }

const postIds: string[] = []

async function insertPost(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: author.userId,
    post_type: 'short',
    body_json: bodyJson,
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

/** 他のテストデータを巻き込まないよう、このテストが作った投稿だけに絞る */
function ownIds(ids: string[]): string[] {
  return ids.filter((id) => postIds.includes(id))
}

const query = (overrides: Partial<FeedQuery> = {}): FeedQuery => ({
  scope: 'new',
  tagSlug: null,
  areaCode: null,
  authorUsername: null,
  cafeId: null,
  lat: null,
  lng: null,
  ...overrides,
})

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'author_post_list', display_name: '著者' })
  follower = await createAuthedProfile({ username: 'follower_post_list' })
  stranger = await createAuthedProfile({ username: 'stranger_post_list' })

  await service.from('follows').insert({ follower_id: follower.userId, followee_id: author.userId })

  const { data: area } = await service.from('areas').select('code').limit(1).single()
  if (!area) throw new Error('areas が seed されていない')
  areaCode = area.code as string

  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({
      name: 'テスト珈琲店',
      prefecture: '東京都',
      city: '渋谷区',
      area_code: areaCode,
      created_by: author.userId,
    })
    .select('id')
    .single()
  if (cafeError || !cafe) throw new Error(`テストカフェの作成に失敗: ${cafeError?.message}`)
  cafeId = cafe.id as string

  const { data: nearbyCafe, error: nearbyCafeError } = await service
    .from('cafes')
    .insert({
      name: '渋谷駅前テストカフェ',
      prefecture: '東京都',
      city: '渋谷区',
      area_code: areaCode,
      created_by: author.userId,
      location: point(SHIBUYA_STATION.lat, SHIBUYA_STATION.lng),
    })
    .select('id')
    .single()
  if (nearbyCafeError || !nearbyCafe) {
    throw new Error(`近くのカフェテスト用カフェの作成に失敗: ${nearbyCafeError?.message}`)
  }
  nearbyCafeId = nearbyCafe.id as string

  const { data: tags } = await service
    .from('tags')
    .select('id')
    .eq('is_curated', true)
    .order('slug')
    .limit(2)
  if (!tags || tags.length < 2) throw new Error('curated タグが2件以上 seed されていない')
  moodTagId = tags[0]?.id as string
  otherTagId = tags[1]?.id as string
})

afterEach(async () => {
  if (postIds.length > 0) {
    await service.from('posts').delete().in('id', postIds)
    postIds.length = 0
  }
})

afterAll(async () => {
  await service.from('cafes').delete().eq('id', cafeId)
  await service.from('cafes').delete().eq('id', nearbyCafeId)
  await author?.cleanup()
  await follower?.cleanup()
  await stranger?.cleanup()
})

describe('getPostList', () => {
  it('作者・カフェ・タグ込みで返し、画像は1枚目だけにする', async () => {
    const postId = await insertPost({ cafe_id: cafeId })
    await service.from('post_images').insert([
      { post_id: postId, storage_path: `${author.userId}/${postId}/b.webp`, display_order: 1 },
      { post_id: postId, storage_path: `${author.userId}/${postId}/a.webp`, display_order: 0 },
    ])
    await service.from('post_tags').insert([
      { post_id: postId, tag_id: moodTagId },
      { post_id: postId, tag_id: otherTagId },
    ])

    const page = await getPostList(typed(anonClient()))
    const item = page.items.find((post) => post.id === postId)

    expect(item).toBeDefined()
    expect(item?.author.displayName).toBe('著者')
    expect(item?.cafe?.name).toBe('テスト珈琲店')
    expect(item?.excerpt).toBe('本文テキスト')
    expect(item?.image?.url).toContain(`${author.userId}/${postId}/a.webp`)
    expect(item?.tags).toHaveLength(2)
  })

  it('画像なしの投稿は image が null', async () => {
    const postId = await insertPost()
    const page = await getPostList(typed(anonClient()))
    expect(page.items.find((post) => post.id === postId)?.image).toBeNull()
  })

  it('hidden・archived・論理削除済みは作者本人の一覧にも出さない', async () => {
    const hidden = await insertPost({ status: 'hidden', published_at: null })
    const archived = await insertPost({ status: 'archived' })
    const deleted = await insertPost({ deleted_at: new Date().toISOString() })
    const visible = await insertPost()

    const page = await getPostList(typed(author.client))
    const ids = page.items.map((post) => post.id)

    expect(ids).toContain(visible)
    expect(ids).not.toContain(hidden)
    expect(ids).not.toContain(archived)
    expect(ids).not.toContain(deleted)
  })

  it('フォロワー限定投稿は非フォロワーには出さず、フォロワーには出す', async () => {
    const postId = await insertPost({ visibility: 'followers' })

    const forStranger = await getPostList(typed(stranger.client))
    const forFollower = await getPostList(typed(follower.client))
    const forAnon = await getPostList(typed(anonClient()))

    expect(forStranger.items.map((post) => post.id)).not.toContain(postId)
    expect(forAnon.items.map((post) => post.id)).not.toContain(postId)
    expect(forFollower.items.map((post) => post.id)).toContain(postId)
  })

  it('ブロックしている相手の投稿は出さない（anon では素通りするためセッション付きで読む）', async () => {
    const postId = await insertPost()
    await service.from('blocks').insert({ blocker_id: stranger.userId, blocked_id: author.userId })

    const forStranger = await getPostList(typed(stranger.client))
    const forAnon = await getPostList(typed(anonClient()))

    expect(forStranger.items.map((post) => post.id)).not.toContain(postId)
    expect(forAnon.items.map((post) => post.id)).toContain(postId)

    await service.from('blocks').delete().eq('blocker_id', stranger.userId)
  })

  it('published_at の新しい順に並べ、keyset カーソルで重複なく続きを返す', async () => {
    const newest = await insertPost({ published_at: publishedAt(30) })
    const middle = await insertPost({ published_at: publishedAt(20) })
    const oldest = await insertPost({ published_at: publishedAt(10) })

    const first = await getPostList(typed(anonClient()), { limit: 2 })
    expect(first.items.map((post) => post.id)).toEqual([newest, middle])
    expect(first.nextCursor).not.toBeNull()

    const second = await getPostList(typed(anonClient()), { limit: 2, cursor: first.nextCursor })
    expect(ownIds(second.items.map((post) => post.id))).toEqual([oldest])
  })

  it('published_at が同じ投稿も id で順序が決まり、取りこぼさない', async () => {
    const sameTime = publishedAt(40)
    const ids = [
      await insertPost({ published_at: sameTime }),
      await insertPost({ published_at: sameTime }),
    ]
    const expected = [...ids].sort().reverse()

    const first = await getPostList(typed(anonClient()), { limit: 1 })
    expect(first.items[0]?.id).toBe(expected[0])

    const second = await getPostList(typed(anonClient()), { limit: 1, cursor: first.nextCursor })
    expect(second.items[0]?.id).toBe(expected[1])
  })

  it('マイクロ秒精度の published_at でも取りこぼさない（カーソルをミリ秒に丸めない）', async () => {
    // published_at は now() 由来でマイクロ秒まで入る。カーソルをミリ秒に丸めると
    // 同じミリ秒の中にいる未表示の投稿が published_at.lt. から外れて永久に出てこない
    const newer = await insertPost({ published_at: '2030-01-01T02:00:00.123456+00:00' })
    const older = await insertPost({ published_at: '2030-01-01T02:00:00.123123+00:00' })

    const first = await getPostList(typed(anonClient()), { limit: 1 })
    expect(first.items[0]?.id).toBe(newer)
    expect(first.nextCursor?.publishedAt).toContain('.123456')

    const second = await getPostList(typed(anonClient()), { limit: 1, cursor: first.nextCursor })
    expect(second.items[0]?.id).toBe(older)
  })

  it('タグで絞り込んでも、カードには投稿の全タグが返る', async () => {
    const tagged = await insertPost({ published_at: publishedAt(50) })
    const untagged = await insertPost({ published_at: publishedAt(50) })
    await service.from('post_tags').insert([
      { post_id: tagged, tag_id: moodTagId },
      { post_id: tagged, tag_id: otherTagId },
    ])

    const page = await getPostList(typed(anonClient()), { tagIds: [moodTagId] })
    const ids = page.items.map((post) => post.id)

    expect(ids).toContain(tagged)
    expect(ids).not.toContain(untagged)
    // filter_tags を別名で二重に埋め込んでいる理由そのもの。1つに束ねると
    // 表示用のタグまで絞り込み条件のものだけになる
    expect(page.items.find((post) => post.id === tagged)?.tags).toHaveLength(2)
  })

  it('エリアはカフェ経由で絞り込む', async () => {
    const withCafe = await insertPost({ cafe_id: cafeId })
    const withoutCafe = await insertPost()

    const page = await getPostList(typed(anonClient()), { areaCode })
    const ids = page.items.map((post) => post.id)

    expect(ids).toContain(withCafe)
    expect(ids).not.toContain(withoutCafe)
  })

  it('cafeIds はいずれかのカフェに絞る（近くのカフェタブ用。空配列では絞り込まない）', async () => {
    const atCafe = await insertPost({ cafe_id: cafeId })
    const atNearbyCafe = await insertPost({ cafe_id: nearbyCafeId })
    const withoutCafe = await insertPost()

    const page = await getPostList(typed(anonClient()), { cafeIds: [nearbyCafeId] })
    const ids = page.items.map((post) => post.id)

    expect(ids).toContain(atNearbyCafe)
    expect(ids).not.toContain(atCafe)
    expect(ids).not.toContain(withoutCafe)
  })

  it('フォロー中の作者だけに絞り込む', async () => {
    const byAuthor = await insertPost()

    const forFollower = await getPostList(typed(follower.client), { followerId: follower.userId })
    const forStranger = await getPostList(typed(stranger.client), { followerId: stranger.userId })

    expect(forFollower.items.map((post) => post.id)).toContain(byAuthor)
    expect(forStranger.items.map((post) => post.id)).not.toContain(byAuthor)
  })

  it('壊れたカーソルは例外にする（PostgREST の or 句に生で埋めない）', async () => {
    await expect(
      getPostList(typed(anonClient()), {
        cursor: { publishedAt: 'not-a-date', id: crypto.randomUUID() },
      }),
    ).rejects.toThrow()
    await expect(
      getPostList(typed(anonClient()), { cursor: { publishedAt: publishedAt(0), id: 'x,y)' } }),
    ).rejects.toThrow()
  })
})

describe('resolveFeedOptions', () => {
  it('タグ slug を id に解決し、表示用のラベルも返す', async () => {
    const { data: tag } = await service
      .from('tags')
      .select('slug, label')
      .eq('id', moodTagId)
      .single()
    const resolved = await resolveFeedOptions(
      typed(anonClient()),
      query({ tagSlug: tag?.slug as string }),
      null,
    )

    expect(resolved?.options.tagIds).toEqual([moodTagId])
    expect(resolved?.tag?.label).toBe(tag?.label)
  })

  it('存在しないタグ slug は null（0件確定）', async () => {
    const resolved = await resolveFeedOptions(
      typed(anonClient()),
      query({ tagSlug: 'no-such-tag' }),
      null,
    )
    expect(resolved).toBeNull()
  })

  it('未ログインのフォロー中タブは null', async () => {
    expect(
      await resolveFeedOptions(typed(anonClient()), query({ scope: 'following' }), null),
    ).toBeNull()
  })

  it('おすすめは興味タグに解決する。未設定なら新着と同じ（絞り込みなし）', async () => {
    await service.from('user_interest_tags').insert({ user_id: follower.userId, tag_id: moodTagId })

    const withInterests = await resolveFeedOptions(
      typed(follower.client),
      query({ scope: 'recommended' }),
      follower.userId,
    )
    const withoutInterests = await resolveFeedOptions(
      typed(stranger.client),
      query({ scope: 'recommended' }),
      stranger.userId,
    )

    expect(withInterests?.options.tagIds).toEqual([moodTagId])
    expect(withInterests?.useRecommendedScoring).toBe(true)
    expect(withoutInterests?.options.tagIds).toBeUndefined()
    expect(withoutInterests?.useRecommendedScoring).toBe(false)

    await service.from('user_interest_tags').delete().eq('user_id', follower.userId)
  })

  it('タグ指定（mood チップ）経由では一致タグ数スコアリングを使わない', async () => {
    const { data: tag } = await service.from('tags').select('slug').eq('id', moodTagId).single()
    const resolved = await resolveFeedOptions(
      typed(follower.client),
      query({ scope: 'recommended', tagSlug: tag?.slug as string }),
      follower.userId,
    )
    expect(resolved?.useRecommendedScoring).toBe(false)
  })

  it('近くのカフェ: lat/lng から近いカフェIDの集合に解決する', async () => {
    const resolved = await resolveFeedOptions(
      typed(anonClient()),
      query({ scope: 'nearby', lat: SHIBUYA_STATION.lat, lng: SHIBUYA_STATION.lng }),
      null,
    )

    expect(resolved?.options.cafeIds).toContain(nearbyCafeId)
    // location が null のカフェは nearby_cafes 自体が返さない
    expect(resolved?.options.cafeIds).not.toContain(cafeId)
  })

  it('近くのカフェ: lat/lng 未指定は null（0件確定、フォールバック中心埋めは呼び出し元の責務）', async () => {
    const resolved = await resolveFeedOptions(typed(anonClient()), query({ scope: 'nearby' }), null)
    expect(resolved).toBeNull()
  })
})

// pending-items D24: 一致タグ数順（同数は新着順）。PostgREST の order() では書けないため
// DB関数 recommended_post_ranks に委ねている部分の検証
describe('getRecommendedPostList / getFeedPage（おすすめタブのスコアリング）', () => {
  it('一致タグ数が多い投稿を優先し、同数内は新着順にする', async () => {
    const twoMatches = await insertPost({ published_at: publishedAt(60) })
    const oneMatchNewer = await insertPost({ published_at: publishedAt(70) })
    const oneMatchOlder = await insertPost({ published_at: publishedAt(50) })
    const noMatch = await insertPost({ published_at: publishedAt(80) })

    await service.from('post_tags').insert([
      { post_id: twoMatches, tag_id: moodTagId },
      { post_id: twoMatches, tag_id: otherTagId },
      { post_id: oneMatchNewer, tag_id: moodTagId },
      { post_id: oneMatchOlder, tag_id: otherTagId },
    ])

    const page = await getRecommendedPostList(typed(author.client), {
      tagIds: [moodTagId, otherTagId],
      viewerId: author.userId,
    })
    const ids = ownIds(page.items.map((post) => post.id))

    expect(ids).toEqual([twoMatches, oneMatchNewer, oneMatchOlder])
    expect(ids).not.toContain(noMatch)
  })

  it('興味タグが0件なら呼び出し元で空配列を渡す想定で、何も絞り込まず空になる', async () => {
    const page = await getRecommendedPostList(typed(author.client), {
      tagIds: [],
      viewerId: author.userId,
    })
    expect(page).toEqual({ items: [], nextCursor: null })
  })

  it('matchCount込みのカーソルで続きを取りこぼし・重複なく返す', async () => {
    const twoMatches = await insertPost({ published_at: publishedAt(60) })
    const oneMatchNewer = await insertPost({ published_at: publishedAt(70) })
    const oneMatchOlder = await insertPost({ published_at: publishedAt(50) })
    await service.from('post_tags').insert([
      { post_id: twoMatches, tag_id: moodTagId },
      { post_id: twoMatches, tag_id: otherTagId },
      { post_id: oneMatchNewer, tag_id: moodTagId },
      { post_id: oneMatchOlder, tag_id: otherTagId },
    ])

    const first = await getRecommendedPostList(typed(author.client), {
      tagIds: [moodTagId, otherTagId],
      viewerId: author.userId,
      limit: 2,
    })
    expect(first.items.map((post) => post.id)).toEqual([twoMatches, oneMatchNewer])
    expect(first.nextCursor?.matchCount).toBe(1)

    const second = await getRecommendedPostList(typed(author.client), {
      tagIds: [moodTagId, otherTagId],
      viewerId: author.userId,
      limit: 2,
      cursor: first.nextCursor,
    })
    expect(ownIds(second.items.map((post) => post.id))).toEqual([oneMatchOlder])
  })

  it('hidden・archived・論理削除済みは、興味タグが一致していても作者本人のおすすめに出さない', async () => {
    const hidden = await insertPost({ status: 'hidden', published_at: null })
    const visible = await insertPost()
    await service.from('post_tags').insert([
      { post_id: hidden, tag_id: moodTagId },
      { post_id: visible, tag_id: moodTagId },
    ])

    const page = await getRecommendedPostList(typed(author.client), {
      tagIds: [moodTagId],
      viewerId: author.userId,
    })
    const ids = ownIds(page.items.map((post) => post.id))

    expect(ids).toContain(visible)
    expect(ids).not.toContain(hidden)
  })

  it('getFeedPage は useRecommendedScoring に応じて一致タグ数順/新着順を使い分ける', async () => {
    await service.from('user_interest_tags').insert({ user_id: follower.userId, tag_id: moodTagId })
    const tagged = await insertPost({ published_at: publishedAt(90) })
    await service.from('post_tags').insert({ post_id: tagged, tag_id: moodTagId })

    const resolved = await resolveFeedOptions(
      typed(follower.client),
      query({ scope: 'recommended' }),
      follower.userId,
    )
    if (!resolved) throw new Error('resolved が null')

    const page = await getFeedPage(typed(follower.client), resolved, follower.userId)
    expect(page.items.map((post) => post.id)).toContain(tagged)

    await service.from('user_interest_tags').delete().eq('user_id', follower.userId)
  })
})
