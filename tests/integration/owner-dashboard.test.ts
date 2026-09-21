import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getOwnerDashboard } from '@/lib/owner/dashboard'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// lib/owner/dashboard.ts を実 DB に対して動かす。確認したいのは:
//  1. verified_owner_id が呼び出し元本人でなければ null（他人のカフェのダッシュボードが見えない）
//  2. 未ログインは null
//  3. 今週/先週の投稿数・いいね・保存の集計が published_at の週境界（JST月曜起点）で正しく分かれること
//  4. 承認済み申請の reviewed_at が verifiedSince に載ること
//  5. 最新の投稿が cafeId で絞り込まれていること

const service = serviceRoleClient()
const anon = anonClient()

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ダッシュボードのテスト投稿' }] }],
}

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

let owner: AuthedUser
let otherOwner: AuthedUser

const cafeIds: string[] = []
const postIds: string[] = []
const verificationIds: string[] = []

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

async function insertApprovedVerification(
  cafeId: string,
  userId: string,
  reviewedAt: string,
): Promise<void> {
  const { data, error } = await service
    .from('cafe_owner_verifications')
    .insert({
      cafe_id: cafeId,
      user_id: userId,
      status: 'approved',
      document_urls: [
        { type: 'business_license', path: 'x' },
        { type: 'business_card', path: 'y' },
      ],
      contact_email: 'owner@example.test',
      reviewed_at: reviewedAt,
    })
    .select('id')
    .single()
  if (error || !data)
    throw new Error(`テスト用 cafe_owner_verifications の作成に失敗: ${error?.message}`)
  verificationIds.push(data.id)
}

async function insertPost(cafeId: string, overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: owner.userId,
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

// 2026-09-23(水) JST 15:00。週境界計算のテストと同じ基準値を使う
const NOW = new Date('2026-09-23T06:00:00.000Z')
// 今週月曜 0:00 JST = 2026-09-20T15:00:00.000Z
const THIS_WEEK = new Date('2026-09-21T03:00:00.000Z').toISOString()
// 先週の水曜（前週の範囲内）
const LAST_WEEK = new Date('2026-09-16T03:00:00.000Z').toISOString()

let verifiedCafeId: string
let unverifiedCafeId: string

beforeAll(async () => {
  owner = await createAuthedProfile({ username: 'owner_dashboard', role: 'owner' })
  otherOwner = await createAuthedProfile({ username: 'other_owner_dashboard', role: 'owner' })

  // guard_cafe_owner_verifications_cafe_claimed は verified_owner_id 設定済みカフェへの
  // INSERT を弾くため、承認済み申請の行を先に作ってから verified_owner_id を付与する
  // （resolveOwnerVerification と同じ順序 — app/_actions/admin-owner-verifications.ts）
  verifiedCafeId = await insertCafe({ name: '認証済みカフェ' })
  unverifiedCafeId = await insertCafe({ name: '未認証カフェ' })
  await insertApprovedVerification(verifiedCafeId, owner.userId, '2026-09-08T00:00:00.000Z')
  const { error: claimError } = await service
    .from('cafes')
    .update({ verified_owner_id: owner.userId })
    .eq('id', verifiedCafeId)
  if (claimError) throw new Error(`verified_owner_id の設定に失敗: ${claimError.message}`)

  // 今週: 2件（いいね10+20, 保存1+2）
  await insertPost(verifiedCafeId, { published_at: THIS_WEEK, like_count: 10, bookmark_count: 1 })
  await insertPost(verifiedCafeId, { published_at: THIS_WEEK, like_count: 20, bookmark_count: 2 })
  // 先週: 1件（いいね5, 保存1）
  await insertPost(verifiedCafeId, { published_at: LAST_WEEK, like_count: 5, bookmark_count: 1 })
  // 対象外: 予約行（hidden・published_at null）
  await insertPost(verifiedCafeId, { status: 'hidden', published_at: null })
})

afterAll(async () => {
  if (verificationIds.length > 0)
    await service.from('cafe_owner_verifications').delete().in('id', verificationIds)
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  if (cafeIds.length > 0) await service.from('cafes').delete().in('id', cafeIds)
  await owner?.cleanup()
  await otherOwner?.cleanup()
})

describe('getOwnerDashboard', () => {
  it('未ログインは null', async () => {
    expect(await getOwnerDashboard(typed(anon), verifiedCafeId, NOW)).toBeNull()
  })

  it('他人が認証したカフェは null（落とし穴1: role=ownerなら誰でも閲覧できてしまう穴を塞ぐ）', async () => {
    expect(await getOwnerDashboard(typed(otherOwner.client), verifiedCafeId, NOW)).toBeNull()
  })

  it('verified_owner_id が未設定のカフェは null', async () => {
    expect(await getOwnerDashboard(typed(owner.client), unverifiedCafeId, NOW)).toBeNull()
  })

  it('存在しないカフェは null', async () => {
    expect(await getOwnerDashboard(typed(owner.client), crypto.randomUUID(), NOW)).toBeNull()
  })

  it('本人には今週/先週の集計・認証日・最新投稿を返す', async () => {
    const dashboard = await getOwnerDashboard(typed(owner.client), verifiedCafeId, NOW)

    expect(dashboard?.cafe).toMatchObject({
      id: verifiedCafeId,
      name: '認証済みカフェ',
      verifiedSince: '2026-09-08T00:00:00+00:00',
    })
    expect(dashboard?.posts).toEqual({ count: 2, changePct: 100 })
    expect(dashboard?.likes).toEqual({ count: 30, changePct: 500 })
    expect(dashboard?.bookmarks).toEqual({ count: 3, changePct: 200 })
    expect(dashboard?.congestion).toEqual({ source: 'none', levelAvg: null, sampleCount: 0 })
    expect(dashboard?.latestPosts.length).toBe(3)
    expect(dashboard?.latestPosts.every((post) => post.cafe?.id === verifiedCafeId)).toBe(true)
  })
})
