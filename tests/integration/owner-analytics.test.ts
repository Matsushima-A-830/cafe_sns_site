import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getCafeAnalytics } from '@/lib/owner/analytics'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// lib/owner/analytics.ts を実DBに対して動かす。確認したいのは:
//  1. 他人が認証したカフェ・未ログインは null（getOwnerDashboard と同じ落とし穴1のガード）
//  2. hidden/deleted/予約行(published_at null)の投稿が集計から漏れずに除外されること
//  3. get_cafe_top_posters は非オーナーから呼ぶと FORBIDDEN になること（オーナー本人はOK）
//  4. get_cafe_weekday_congestion は匿名でも呼べ、JST基準で曜日が正しく振られること
//     （UTC 0〜8時台の投稿がJSTでは前日ではなく当日の曜日に乗ること）
//  5. タグ集計が post_tags 経由で正しく多い順に集計されること

const service = serviceRoleClient()
const anon = anonClient()

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '分析テスト投稿' }] }],
}

let owner: AuthedUser
let otherOwner: AuthedUser
let poster: AuthedUser

const cafeIds: string[] = []
const postIds: string[] = []
let cafeId: string
let moodTagId: string
let otherTagId: string

async function insertPost(overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: poster.userId,
    cafe_id: cafeId,
    post_type: 'short',
    body_json: bodyJson,
    status: 'published',
    like_count: 0,
    bookmark_count: 0,
    ...overrides,
  })
  if (error) throw new Error(`テスト投稿の作成に失敗: ${error.message}`)
  postIds.push(id)
  return id
}

// 2026-09-23(水) JST 15:00。dashboard の統合テストと同じ基準値
const NOW = new Date('2026-09-23T06:00:00.000Z')
// 今週内（JST月曜〜）の published_at
const THIS_WEEK = new Date('2026-09-21T03:00:00.000Z').toISOString()
// JST 2026-09-21(月) 07:00 = UTC 2026-09-20T22:00:00Z（UTC基準だと日曜だがJSTでは月曜）
const JST_MONDAY_EARLY_MORNING = '2026-09-20T22:00:00.000Z'

beforeAll(async () => {
  owner = await createAuthedProfile({ username: 'owner_analytics', role: 'owner' })
  otherOwner = await createAuthedProfile({ username: 'other_owner_analytics', role: 'owner' })
  poster = await createAuthedProfile({ username: 'poster_analytics', role: 'user' })

  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({ name: '分析テストカフェ', prefecture: '東京都', city: '渋谷区' })
    .select('id')
    .single()
  if (cafeError || !cafe) throw new Error(`テストカフェの作成に失敗: ${cafeError?.message}`)
  cafeId = cafe.id
  cafeIds.push(cafeId)

  const { error: claimError } = await service
    .from('cafes')
    .update({ verified_owner_id: owner.userId })
    .eq('id', cafeId)
  if (claimError) throw new Error(`verified_owner_id の設定に失敗: ${claimError.message}`)

  const { data: tags } = await service
    .from('tags')
    .select('id')
    .eq('is_curated', true)
    .order('slug')
    .limit(2)
  if (!tags || tags.length < 2) throw new Error('curated タグが2件以上 seed されていない')
  moodTagId = tags[0]?.id as string
  otherTagId = tags[1]?.id as string

  // 今週: 2件（片方に2タグ）
  const taggedPost = await insertPost({
    published_at: THIS_WEEK,
    like_count: 10,
    bookmark_count: 1,
  })
  await insertPost({ published_at: THIS_WEEK, like_count: 5, bookmark_count: 0 })
  await service.from('post_tags').insert([
    { post_id: taggedPost, tag_id: moodTagId },
    { post_id: taggedPost, tag_id: otherTagId },
  ])
  // 対象外: hidden・deleted・予約行
  await insertPost({ status: 'hidden', published_at: THIS_WEEK })
  await insertPost({
    status: 'published',
    published_at: THIS_WEEK,
    deleted_at: new Date().toISOString(),
  })
  // status='published' かつ published_at=null は set_posts_published_at トリガーが
  // now() を補完してしまうため、「予約行」の再現には使えない（status で除外される行で確認する）
  await insertPost({ status: 'archived', published_at: null })

  // 混雑度: JST月曜早朝1件（UTCだと日曜）
  await service.from('cafe_congestion_reports').insert({
    cafe_id: cafeId,
    user_id: poster.userId,
    level: 5,
    reported_at: JST_MONDAY_EARLY_MORNING,
  })
})

afterAll(async () => {
  await service.from('cafe_congestion_reports').delete().eq('cafe_id', cafeId)
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  if (cafeIds.length > 0) await service.from('cafes').delete().in('id', cafeIds)
  await owner?.cleanup()
  await otherOwner?.cleanup()
  await poster?.cleanup()
})

describe('getCafeAnalytics', () => {
  it('未ログインは null', async () => {
    expect(await getCafeAnalytics(typed(anon), cafeId, 4, NOW)).toBeNull()
  })

  it('他人が認証したカフェは null', async () => {
    expect(await getCafeAnalytics(typed(otherOwner.client), cafeId, 4, NOW)).toBeNull()
  })

  it('hidden/deleted/予約行を除いた投稿数・いいね・保存を集計する', async () => {
    const result = await getCafeAnalytics(typed(owner.client), cafeId, 4, NOW)
    expect(result?.posts.count).toBe(2)
    expect(result?.likes.count).toBe(15)
    expect(result?.bookmarks.count).toBe(1)
  })

  it('タグ集計は多い順に返す（片方のみタグ2件、他方は0件）', async () => {
    const result = await getCafeAnalytics(typed(owner.client), cafeId, 4, NOW)
    expect(result?.tags.map((t) => t.tagId).sort()).toEqual([moodTagId, otherTagId].sort())
    expect(result?.tags.every((t) => t.count === 1)).toBe(true)
  })

  it('投稿者トップにテスト投稿者が1名（2投稿）として出る', async () => {
    const result = await getCafeAnalytics(typed(owner.client), cafeId, 4, NOW)
    expect(result?.topPosters).toEqual([
      expect.objectContaining({ userId: poster.userId, postCount: 2 }),
    ])
  })

  it('曜日別混雑度: JST基準で月曜に振られる（UTCでは日曜だがJSTでは月曜)', async () => {
    const result = await getCafeAnalytics(typed(owner.client), cafeId, 4, NOW)
    const monday = result?.weekdayCongestion.find((d) => d.label === '月')
    const sunday = result?.weekdayCongestion.find((d) => d.label === '日')
    expect(monday).toEqual({ dayOfWeek: 1, label: '月', levelAvg: 5, sampleCount: 1 })
    expect(sunday).toEqual({ dayOfWeek: 0, label: '日', levelAvg: null, sampleCount: 0 })
  })
})

describe('get_cafe_top_posters RPC', () => {
  it('オーナー本人以外が呼ぶと FORBIDDEN', async () => {
    const { error } = await typed(otherOwner.client).rpc('get_cafe_top_posters', {
      p_cafe_id: cafeId,
      p_from: '2026-01-01T00:00:00.000Z',
      p_to: '2027-01-01T00:00:00.000Z',
    })
    expect(error?.message).toContain('FORBIDDEN')
  })
})

describe('get_cafe_weekday_congestion RPC', () => {
  it('匿名でも呼べる（公開の集計値）', async () => {
    const { data, error } = await typed(anon).rpc('get_cafe_weekday_congestion', {
      p_cafe_id: cafeId,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(7)
  })
})
