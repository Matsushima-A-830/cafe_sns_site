import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getUserEarnedBadges } from '@/lib/badges/earned'
import type { Database } from '@/types/database'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

const service = serviceRoleClient()

let owner: AuthedUser
let viewer: AuthedUser

const cafeIds: string[] = []
const postIds: string[] = []

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'バッジ獲得テスト投稿' }] }],
}

async function insertPublishedPost(authorId: string) {
  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({ name: 'テストバッジカフェ', prefecture: '東京都', city: '渋谷区' })
    .select('id')
    .single()
  if (cafeError || !cafe) throw new Error(`テスト用 cafes の作成に失敗: ${cafeError?.message}`)
  cafeIds.push(cafe.id)

  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: authorId,
    cafe_id: cafe.id,
    post_type: 'short',
    body_json: bodyJson,
    status: 'published',
    published_at: new Date().toISOString(),
  })
  if (error) throw new Error(`テスト投稿の作成に失敗: ${error.message}`)
  postIds.push(id)
  return id
}

beforeAll(async () => {
  owner = await createAuthedProfile({ username: 'badge_earned_owner' })
  viewer = await createAuthedProfile({ username: 'badge_earned_viewer' })
})

afterAll(async () => {
  await owner?.cleanup()
  await viewer?.cleanup()
})

afterEach(async () => {
  await service.from('user_badges').delete().eq('user_id', owner.userId)
  await service.from('likes').delete().eq('user_id', owner.userId)
  if (postIds.length) {
    await service.from('posts').delete().in('id', postIds)
    postIds.length = 0
  }
  if (cafeIds.length) {
    await service.from('cafes').delete().in('id', cafeIds)
    cafeIds.length = 0
  }
})

describe('getUserEarnedBadges', () => {
  it('未獲得のユーザーは空配列を返す', async () => {
    const client = typed(viewer.client)
    const badges = await getUserEarnedBadges(client, owner.userId)
    expect(badges).toEqual([])
  })

  it('他人のセッションからでも獲得済みバッジを code/name/awardedAt 付きで取得できる', async () => {
    await insertPublishedPost(owner.userId)
    await owner.client.rpc('award_badge', { p_user_id: owner.userId, p_badge_code: 'POST_FIRST' })

    const client = typed(viewer.client)
    const badges = await getUserEarnedBadges(client, owner.userId)

    expect(badges).toHaveLength(1)
    expect(badges[0]?.code).toBe('POST_FIRST')
    expect(badges[0]?.name).toBeTruthy()
    expect(badges[0]?.awardedAt).toBeTruthy()
  })

  it('awarded_at の新しい順に並ぶ', async () => {
    const postId = await insertPublishedPost(owner.userId)
    await owner.client.rpc('award_badge', { p_user_id: owner.userId, p_badge_code: 'POST_FIRST' })

    // likes_given の実データ判定(award_badge 内)向けに直接 likes 行を作る
    const { error: likeError } = await service
      .from('likes')
      .insert({ user_id: owner.userId, post_id: postId })
    if (likeError) throw new Error(`テスト用 likes の作成に失敗: ${likeError.message}`)
    await owner.client.rpc('award_badge', {
      p_user_id: owner.userId,
      p_badge_code: 'COM_FIRST_LIKE_GIVEN',
    })

    const client = typed(viewer.client)
    const badges = await getUserEarnedBadges(client, owner.userId)

    expect(badges).toHaveLength(2)
    expect(new Date(badges[0]?.awardedAt ?? 0).getTime()).toBeGreaterThanOrEqual(
      new Date(badges[1]?.awardedAt ?? 0).getTime(),
    )
  })
})
