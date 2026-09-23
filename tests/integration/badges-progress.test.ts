import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getConquestMapProgress } from '@/lib/badges/conquest-map'
import { getAllBadgeProgress } from '@/lib/badges/progress'
import type { Database } from '@/types/database'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

const service = serviceRoleClient()

let user: AuthedUser

const cafeIds: string[] = []
const postIds: string[] = []

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'バッジ進捗テスト投稿' }] }],
}

async function insertCafe(areaCode: string | null = null) {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: 'テスト進捗カフェ', prefecture: '東京都', city: '渋谷区', area_code: areaCode })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id as string
}

async function insertPublishedPost(authorId: string, cafeId?: string) {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: authorId,
    cafe_id: cafeId ?? (await insertCafe()),
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
  user = await createAuthedProfile({ username: 'badge_progress_user' })
})

afterAll(async () => {
  await user?.cleanup()
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
  await service.from('area_visits').delete().eq('user_id', user.userId)
})

describe('getAllBadgeProgress', () => {
  it('20件ぶんの進捗を返し、post_count 系（POST_FIRST/10/50/100）は同じ現在値を共有する', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId)
    await insertPublishedPost(user.userId)

    const progress = await getAllBadgeProgress(client, user.userId)
    expect(progress).toHaveLength(20)

    const postFirst = progress.find((b) => b.code === 'POST_FIRST')
    const post10 = progress.find((b) => b.code === 'POST_10')
    const post50 = progress.find((b) => b.code === 'POST_50')
    const post100 = progress.find((b) => b.code === 'POST_100')

    // criteria.type が同じ(post_count)ぶんは、しきい値だけが違い現在値は共通の集計(2件)から来る。
    // POST_FIRST はしきい値1でキャップされるため、実カウントより小さく見える
    expect(postFirst?.current).toBe(1)
    expect(post10?.current).toBe(2)
    expect(post50?.current).toBe(2)
    expect(post100?.current).toBe(2)
    expect(postFirst?.threshold).toBe(1)
    expect(post10?.threshold).toBe(10)
  })

  it('current はしきい値でキャップされる（進捗バーが5個を超えて溢れない）', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId)

    const progress = await getAllBadgeProgress(client, user.userId)
    const post10 = progress.find((b) => b.code === 'POST_10')
    expect(post10?.current).toBeLessThanOrEqual(post10?.threshold ?? 0)
  })

  it('獲得済みは user_badges の実績を正とする（current>=threshold の再計算に依存しない）', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId)
    await user.client.rpc('award_badge', { p_user_id: user.userId, p_badge_code: 'POST_FIRST' })

    const progress = await getAllBadgeProgress(client, user.userId)
    const postFirst = progress.find((b) => b.code === 'POST_FIRST')
    expect(postFirst?.earned).toBe(true)
    expect(postFirst?.awardedAt).not.toBeNull()

    const post10 = progress.find((b) => b.code === 'POST_10')
    expect(post10?.earned).toBe(false)
  })

  it('未着手のユーザーはすべて current: 0 / earned: false', async () => {
    const client = typed(user.client)
    const progress = await getAllBadgeProgress(client, user.userId)
    expect(progress.every((b) => b.current === 0 && !b.earned)).toBe(true)
  })
})

describe('getConquestMapProgress', () => {
  it('東京23区(level=ward, JP-13)一覧を返し、area_visits の有無で訪問済みを判定する', async () => {
    const client = typed(user.client)
    await insertPublishedPost(user.userId, await insertCafe('JP-13-shibuya-ku'))

    const map = await getConquestMapProgress(client, user.userId)
    expect(map.totalCount).toBe(23)
    expect(map.visitedCount).toBe(1)

    const shibuya = map.wards.find((w) => w.code === 'JP-13-shibuya-ku')
    expect(shibuya?.visited).toBe(true)
    const shinjuku = map.wards.find((w) => w.code === 'JP-13-shinjuku-ku')
    expect(shinjuku?.visited).toBe(false)
  })

  it('未訪問のユーザーは visitedCount: 0', async () => {
    const client = typed(user.client)
    const map = await getConquestMapProgress(client, user.userId)
    expect(map.visitedCount).toBe(0)
    expect(map.totalCount).toBe(23)
  })
})
