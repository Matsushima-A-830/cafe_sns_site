import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'

const anon = anonClient()
const service = serviceRoleClient()

let user: AuthedUser
let otherUser: AuthedUser

const cafeIds: string[] = []
const postIds: string[] = []

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'バッジテスト投稿' }] }],
}

async function insertCafe(areaCode: string | null) {
  const { data, error } = await service
    .from('cafes')
    .insert({
      name: 'テストバッジカフェ',
      prefecture: '東京都',
      city: '渋谷区',
      area_code: areaCode,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id as string
}

async function insertPublishedPost(cafeId: string, authorId: string) {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: authorId,
    cafe_id: cafeId,
    post_type: 'short',
    body_json: bodyJson,
    status: 'published',
    published_at: new Date().toISOString(),
  })
  if (error) throw new Error(`テスト投稿の作成に失敗: ${error.message}`)
  postIds.push(id)
  return id
}

async function firstBadgeCode(): Promise<string> {
  const { data, error } = await service.from('badges').select('code').limit(1).single()
  if (error || !data) throw new Error(`badges seed が見つからない: ${error?.message}`)
  return data.code as string
}

beforeAll(async () => {
  user = await createAuthedProfile({ username: 'badge_user' })
  otherUser = await createAuthedProfile({ username: 'badge_other_user' })
})

afterAll(async () => {
  await user?.cleanup()
  await otherUser?.cleanup()
})

afterEach(async () => {
  if (postIds.length) {
    await service.from('posts').delete().in('id', postIds)
    postIds.length = 0
  }
  if (cafeIds.length) {
    await service.from('cafes').delete().in('id', cafeIds)
    cafeIds.length = 0
  }
  await service.from('user_badges').delete().eq('user_id', user.userId)
  await service.from('notifications').delete().eq('recipient_id', user.userId).eq('type', 'badge')
  await service.from('area_visits').delete().eq('user_id', user.userId)
})

describe('user_badges の RLS', () => {
  it('全ユーザーが SELECT できる', async () => {
    const badgeCode = await firstBadgeCode()
    await user.client.rpc('award_badge', { p_user_id: user.userId, p_badge_code: badgeCode })

    const { data, error } = await anon
      .from('user_badges')
      .select('user_id')
      .eq('user_id', user.userId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('直接 INSERT は誰にも許可されない（award_badge 経由のみ）', async () => {
    const badgeCode = await firstBadgeCode()
    const { data: badge } = await service.from('badges').select('id').eq('code', badgeCode).single()

    const { error } = await user.client
      .from('user_badges')
      .insert({ user_id: user.userId, badge_id: badge?.id })

    expect(error?.code).toBe(RLS_VIOLATION)
  })
})

describe('award_badge RPC', () => {
  it('自分あてに呼ぶとバッジが付与され、通知が1件作られる', async () => {
    const badgeCode = await firstBadgeCode()

    const { error } = await user.client.rpc('award_badge', {
      p_user_id: user.userId,
      p_badge_code: badgeCode,
    })
    expect(error).toBeNull()

    const badges = await service.from('user_badges').select('user_id').eq('user_id', user.userId)
    expect(badges.data).toHaveLength(1)

    const notifications = await service
      .from('notifications')
      .select('recipient_id, type, entity_type')
      .eq('recipient_id', user.userId)
      .eq('type', 'badge')
    expect(notifications.data).toHaveLength(1)
    expect(notifications.data?.[0]).toMatchObject({ entity_type: 'badge' })
  })

  it('本人操作専用のバッジ(post_count系)を他人あてに呼ぶと FORBIDDEN', async () => {
    const { error } = await user.client.rpc('award_badge', {
      p_user_id: otherUser.userId,
      p_badge_code: 'POST_FIRST',
    })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('regular_customer_count は他人あてでも実データが閾値を満たせば付与できる（オーナーが認定した相手向け）', async () => {
    const cafeId = await insertCafe(null)
    await service
      .from('regular_customers')
      .insert({ user_id: otherUser.userId, cafe_id: cafeId, awarded_by: user.userId })

    const { error } = await user.client.rpc('award_badge', {
      p_user_id: otherUser.userId,
      p_badge_code: 'REGULAR_FIRST',
    })
    expect(error).toBeNull()

    const badges = await service
      .from('user_badges')
      .select('user_id')
      .eq('user_id', otherUser.userId)
    expect(badges.data).toHaveLength(1)

    await service.from('user_badges').delete().eq('user_id', otherUser.userId)
    await service
      .from('notifications')
      .delete()
      .eq('recipient_id', otherUser.userId)
      .eq('type', 'badge')
  })

  it('regular_customer_count が実際は閾値未満なら、他人あての呼び出しは FORBIDDEN（詐称防止）', async () => {
    // regular_customers を作らないまま、達成したふりをして他人に付与しようとする
    const { error } = await user.client.rpc('award_badge', {
      p_user_id: otherUser.userId,
      p_badge_code: 'REGULAR_FIRST',
    })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('存在しないバッジコードは BADGE_NOT_FOUND', async () => {
    const { error } = await user.client.rpc('award_badge', {
      p_user_id: user.userId,
      p_badge_code: 'NOT_A_REAL_BADGE',
    })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('BADGE_NOT_FOUND')
  })

  it('同じバッジを2回呼んでも冪等（重複行・重複通知を作らない）', async () => {
    const badgeCode = await firstBadgeCode()

    await user.client.rpc('award_badge', { p_user_id: user.userId, p_badge_code: badgeCode })
    await user.client.rpc('award_badge', { p_user_id: user.userId, p_badge_code: badgeCode })

    const badges = await service.from('user_badges').select('user_id').eq('user_id', user.userId)
    expect(badges.data).toHaveLength(1)

    const notifications = await service
      .from('notifications')
      .select('recipient_id')
      .eq('recipient_id', user.userId)
      .eq('type', 'badge')
    expect(notifications.data).toHaveLength(1)
  })
})

describe('record_area_visit トリガー', () => {
  it('副地域のカフェに投稿すると自エリアと親の区の両方が訪問済みになる', async () => {
    const cafeId = await insertCafe('JP-13-omotesando')
    await insertPublishedPost(cafeId, user.userId)

    const visits = await service
      .from('area_visits')
      .select('area_code, visit_count')
      .eq('user_id', user.userId)
      .order('area_code')

    const codes = (visits.data ?? []).map((v) => v.area_code)
    expect(codes).toContain('JP-13-omotesando')
    expect(codes).toContain('JP-13-shibuya-ku')
  })

  it('同じユーザーが同じエリアに2投稿すると visit_count が増える', async () => {
    const cafeId = await insertCafe('JP-13-omotesando')
    await insertPublishedPost(cafeId, user.userId)
    await insertPublishedPost(cafeId, user.userId)

    const visit = await service
      .from('area_visits')
      .select('visit_count')
      .eq('user_id', user.userId)
      .eq('area_code', 'JP-13-omotesando')
      .single()

    expect(visit.data?.visit_count).toBe(2)
  })

  it('area_code が無いカフェへの投稿は area_visits を作らない', async () => {
    const cafeId = await insertCafe(null)
    await insertPublishedPost(cafeId, user.userId)

    const visits = await service.from('area_visits').select('area_code').eq('user_id', user.userId)
    expect(visits.data).toEqual([])
  })

  it('area_visits への直接 INSERT は誰にも許可されない（トリガー経由のみ）', async () => {
    const { error } = await user.client.from('area_visits').insert({
      user_id: user.userId,
      area_code: 'JP-13-shibuya-ku',
      first_visited_at: new Date().toISOString(),
      last_visited_at: new Date().toISOString(),
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })
})
