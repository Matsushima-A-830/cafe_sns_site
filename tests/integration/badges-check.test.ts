import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { checkAndAwardBadges } from '@/lib/badges/check'
import { evaluateCriteria } from '@/lib/badges/rules'
import type { Database } from '@/types/database'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

const service = serviceRoleClient()

let user: AuthedUser
let otherUser: AuthedUser

const cafeIds: string[] = []
const postIds: string[] = []

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'バッジ判定テスト投稿' }] }],
}

async function insertCafe(areaCode: string | null = null) {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: 'テスト判定カフェ', prefecture: '東京都', city: '渋谷区', area_code: areaCode })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id as string
}

async function insertPublishedPost(
  authorId: string,
  overrides: { cafeId?: string; tagSlugs?: string[] } = {},
) {
  const cafeId = overrides.cafeId ?? (await insertCafe())
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

  if (overrides.tagSlugs?.length) {
    const { data: tags } = await service
      .from('tags')
      .select('id, slug')
      .in('slug', overrides.tagSlugs)
    for (const tag of tags ?? []) {
      await service.from('post_tags').insert({ post_id: id, tag_id: tag.id })
    }
  }
  return id
}

beforeAll(async () => {
  user = await createAuthedProfile({ username: 'badge_check_user' })
  otherUser = await createAuthedProfile({ username: 'badge_check_other' })
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
  await service.from('regular_customers').delete().eq('user_id', user.userId)
  await service.from('follows').delete().eq('followee_id', user.userId)
  await service
    .from('likes')
    .delete()
    .or(`user_id.eq.${user.userId},user_id.eq.${otherUser.userId}`)
  await service.from('user_badges').delete().eq('user_id', user.userId)
  await service.from('notifications').delete().eq('recipient_id', user.userId).eq('type', 'badge')
  await service.from('area_visits').delete().eq('user_id', user.userId)
})

describe('evaluateCriteria', () => {
  it('post_count: 公開投稿数で判定する', async () => {
    const client = typed(user.client)
    expect(await evaluateCriteria(client, user.userId, { type: 'post_count', threshold: 1 })).toBe(
      false,
    )

    await insertPublishedPost(user.userId)

    expect(await evaluateCriteria(client, user.userId, { type: 'post_count', threshold: 1 })).toBe(
      true,
    )
  })

  it('distinct_area_count: scope.level で絞った訪問エリア数で判定する', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId, { cafeId: await insertCafe('JP-13-shibuya-ku') })
    await insertPublishedPost(user.userId, { cafeId: await insertCafe('JP-13-shinjuku-ku') })

    const twoWards = await evaluateCriteria(client, user.userId, {
      type: 'distinct_area_count',
      scope: { level: 'ward' },
      threshold: 2,
    })
    expect(twoWards).toBe(true)

    const threeWards = await evaluateCriteria(client, user.userId, {
      type: 'distinct_area_count',
      scope: { level: 'ward' },
      threshold: 3,
    })
    expect(threeWards).toBe(false)
  })

  it('distinct_area_count: 副地域投稿は親の区としてもカウントされる（level=ward基準）', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId, { cafeId: await insertCafe('JP-13-omotesando') })

    const wardCount = await evaluateCriteria(client, user.userId, {
      type: 'distinct_area_count',
      scope: { level: 'ward' },
      threshold: 1,
    })
    expect(wardCount).toBe(true)
  })

  it('post_count_with_tag: 指定タグ付き投稿数で判定する', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId, { tagSlugs: ['solo-time'] })

    const matched = await evaluateCriteria(client, user.userId, {
      type: 'post_count_with_tag',
      tag_slug: 'solo-time',
      threshold: 1,
    })
    expect(matched).toBe(true)

    const unmatched = await evaluateCriteria(client, user.userId, {
      type: 'post_count_with_tag',
      tag_slug: 'night-cafe',
      threshold: 1,
    })
    expect(unmatched).toBe(false)
  })

  it('post_count_with_tags_or: いずれかのタグが付いていれば判定を満たす', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId, { tagSlugs: ['work'] })

    const matched = await evaluateCriteria(client, user.userId, {
      type: 'post_count_with_tags_or',
      tag_slugs: ['work', 'study'],
      threshold: 1,
    })
    expect(matched).toBe(true)
  })

  it('post_count_with_tags_or: work/study 両方付いた同一投稿を二重カウントしない', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId, { tagSlugs: ['work', 'study'] })

    const oneMatch = await evaluateCriteria(client, user.userId, {
      type: 'post_count_with_tags_or',
      tag_slugs: ['work', 'study'],
      threshold: 1,
    })
    expect(oneMatch).toBe(true)

    const twoMatch = await evaluateCriteria(client, user.userId, {
      type: 'post_count_with_tags_or',
      tag_slugs: ['work', 'study'],
      threshold: 2,
    })
    expect(twoMatch).toBe(false)
  })

  it('distinct_scene_tag_count: カテゴリ内の異なるタグ数で判定する', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId, { tagSlugs: ['solo-time', 'morning-cafe'] })

    const twoTags = await evaluateCriteria(client, user.userId, {
      type: 'distinct_scene_tag_count',
      category: 'occasion',
      threshold: 2,
    })
    expect(twoTags).toBe(true)

    const threeTags = await evaluateCriteria(client, user.userId, {
      type: 'distinct_scene_tag_count',
      category: 'occasion',
      threshold: 3,
    })
    expect(threeTags).toBe(false)
  })

  it('regular_customer_count: revoked_at が null の現役認定のみ数える', async () => {
    const client = typed(user.client)
    const cafeId = await insertCafe()
    await service
      .from('regular_customers')
      .insert({ user_id: user.userId, cafe_id: cafeId, awarded_by: otherUser.userId })

    expect(
      await evaluateCriteria(client, user.userId, { type: 'regular_customer_count', threshold: 1 }),
    ).toBe(true)

    await service
      .from('regular_customers')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', user.userId)
      .eq('cafe_id', cafeId)

    expect(
      await evaluateCriteria(client, user.userId, { type: 'regular_customer_count', threshold: 1 }),
    ).toBe(false)
  })

  it('follower_count: フォロワー数で判定する', async () => {
    const client = typed(user.client)
    await service
      .from('follows')
      .insert({ follower_id: otherUser.userId, followee_id: user.userId })

    expect(
      await evaluateCriteria(client, user.userId, { type: 'follower_count', threshold: 1 }),
    ).toBe(true)
  })

  it('likes_received / likes_given: 受け取り・送った側それぞれの累計で判定する', async () => {
    const client = typed(user.client)
    const postId = await insertPublishedPost(user.userId)
    await service.from('likes').insert({ user_id: otherUser.userId, post_id: postId })

    expect(
      await evaluateCriteria(client, user.userId, { type: 'likes_received', threshold: 1 }),
    ).toBe(true)
    expect(await evaluateCriteria(client, user.userId, { type: 'likes_given', threshold: 1 })).toBe(
      false,
    )

    const otherPostId = await insertPublishedPost(otherUser.userId)
    await service.from('likes').insert({ user_id: user.userId, post_id: otherPostId })
    postIds.push(otherPostId)

    expect(await evaluateCriteria(client, user.userId, { type: 'likes_given', threshold: 1 })).toBe(
      true,
    )
  })
})

describe('checkAndAwardBadges', () => {
  it('POST_CREATED: 初投稿で POST_FIRST が付与され、通知が1件作られる', async () => {
    await insertPublishedPost(user.userId)

    await checkAndAwardBadges(typed(user.client), user.userId, 'POST_CREATED')

    const { data: badge } = await service
      .from('badges')
      .select('id')
      .eq('code', 'POST_FIRST')
      .single()
    const awarded = await service
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', user.userId)
      .eq('badge_id', badge?.id)
    expect(awarded.data).toHaveLength(1)

    const notifications = await service
      .from('notifications')
      .select('recipient_id')
      .eq('recipient_id', user.userId)
      .eq('type', 'badge')
    expect(notifications.data).toHaveLength(1)
  })

  it('既に獲得済みのバッジは再評価せず、再実行しても重複付与・重複通知にならない', async () => {
    await insertPublishedPost(user.userId)

    await checkAndAwardBadges(typed(user.client), user.userId, 'POST_CREATED')
    await checkAndAwardBadges(typed(user.client), user.userId, 'POST_CREATED')

    const { data: badge } = await service
      .from('badges')
      .select('id')
      .eq('code', 'POST_FIRST')
      .single()
    const awarded = await service
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', user.userId)
      .eq('badge_id', badge?.id)
    expect(awarded.data).toHaveLength(1)
  })

  it('REGULAR_AWARDED: 常連認定1件で REGULAR_FIRST が付与される', async () => {
    const cafeId = await insertCafe()
    await service
      .from('regular_customers')
      .insert({ user_id: user.userId, cafe_id: cafeId, awarded_by: otherUser.userId })

    await checkAndAwardBadges(typed(user.client), user.userId, 'REGULAR_AWARDED')

    const { data: badge } = await service
      .from('badges')
      .select('id')
      .eq('code', 'REGULAR_FIRST')
      .single()
    const awarded = await service
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', user.userId)
      .eq('badge_id', badge?.id)
    expect(awarded.data).toHaveLength(1)
  })

  it('LIKE_GIVEN: 他人の投稿に初めていいねすると COM_FIRST_LIKE_GIVEN が付与される', async () => {
    const otherPostId = await insertPublishedPost(otherUser.userId)
    await service.from('likes').insert({ user_id: user.userId, post_id: otherPostId })

    await checkAndAwardBadges(typed(user.client), user.userId, 'LIKE_GIVEN')

    const { data: badge } = await service
      .from('badges')
      .select('id')
      .eq('code', 'COM_FIRST_LIKE_GIVEN')
      .single()
    const awarded = await service
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', user.userId)
      .eq('badge_id', badge?.id)
    expect(awarded.data).toHaveLength(1)
  })

  it('条件未達のトリガーでは何も付与しない', async () => {
    await checkAndAwardBadges(typed(user.client), user.userId, 'FOLLOW_RECEIVED')

    const awarded = await service.from('user_badges').select('badge_id').eq('user_id', user.userId)
    expect(awarded.data).toEqual([])
  })
})
