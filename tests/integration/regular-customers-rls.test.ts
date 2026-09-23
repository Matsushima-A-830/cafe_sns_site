import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  getOwnedCafeSummary,
  getRegularCandidates,
  listRegularCustomers,
} from '@/lib/owner/regulars'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'

const anon = anonClient()
const service = serviceRoleClient()

let owner: AuthedUser
let otherOwner: AuthedUser
let regular: AuthedUser
let suspended: AuthedUser
let suspendedOwner: AuthedUser

const cafeIds: string[] = []
const postIds: string[] = []
const commentIds: string[] = []

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '常連テスト投稿' }] }],
}

async function insertCafe(ownerId: string | null = null): Promise<string> {
  const { data, error } = await service
    .from('cafes')
    .insert({
      name: 'テスト常連カフェ',
      prefecture: '東京都',
      city: '渋谷区',
      verified_owner_id: ownerId,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id as string
}

async function insertPost(
  cafeId: string,
  authorId: string,
  overrides: Record<string, unknown> = {},
) {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: authorId,
    cafe_id: cafeId,
    post_type: 'short',
    body_json: bodyJson,
    status: 'published',
    published_at: new Date().toISOString(),
    bookmark_count: 3,
    ...overrides,
  })
  if (error) throw new Error(`テスト投稿の作成に失敗: ${error.message}`)
  postIds.push(id)
  return id
}

async function insertComment(postId: string, authorId: string) {
  const { data, error } = await service
    .from('comments')
    .insert({ post_id: postId, author_id: authorId, body: 'いつも美味しいです' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テストコメントの作成に失敗: ${error?.message}`)
  commentIds.push(data.id)
}

beforeAll(async () => {
  owner = await createAuthedProfile({ username: 'owner_regulars', role: 'owner' })
  otherOwner = await createAuthedProfile({ username: 'other_owner_regulars', role: 'owner' })
  regular = await createAuthedProfile({ username: 'regular_customer' })
  suspended = await createAuthedProfile({ username: 'suspended_candidate', status: 'suspended' })
  suspendedOwner = await createAuthedProfile({
    username: 'suspended_owner_regulars',
    role: 'owner',
    status: 'suspended',
  })
})

afterAll(async () => {
  await owner?.cleanup()
  await otherOwner?.cleanup()
  await regular?.cleanup()
  await suspended?.cleanup()
  await suspendedOwner?.cleanup()
})

afterEach(async () => {
  if (commentIds.length) {
    await service.from('comments').delete().in('id', commentIds)
    commentIds.length = 0
  }
  if (postIds.length) {
    await service.from('posts').delete().in('id', postIds)
    postIds.length = 0
  }
  await service.from('regular_customers').delete().eq('awarded_by', owner.userId)
  await service.from('notifications').delete().eq('type', 'regular_awarded')
  if (cafeIds.length) {
    await service.from('cafes').delete().in('id', cafeIds)
    cafeIds.length = 0
  }
})

describe('regular_customers の RLS・制約', () => {
  it('オーナーは自店のユーザーを常連認定できる', async () => {
    const cafeId = await insertCafe(owner.userId)

    const { error } = await owner.client.from('regular_customers').insert({
      user_id: regular.userId,
      cafe_id: cafeId,
      awarded_by: owner.userId,
      note: 'テスト',
    })

    expect(error).toBeNull()
  })

  it('他人のカフェでは認定できない', async () => {
    const cafeId = await insertCafe(owner.userId)

    const { error } = await otherOwner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: otherOwner.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('awarded_by になりすませない', async () => {
    const cafeId = await insertCafe(owner.userId)

    const { error } = await owner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: otherOwner.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('全ユーザーは有効な認定のみ読める。取消済みはオーナー以外に見えない', async () => {
    const cafeId = await insertCafe(owner.userId)
    await owner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: owner.userId })

    const visibleToAnon = await anon
      .from('regular_customers')
      .select('user_id')
      .eq('cafe_id', cafeId)
    expect(visibleToAnon.data).toHaveLength(1)

    await service
      .from('regular_customers')
      .update({ revoked_at: new Date().toISOString() })
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)

    const afterRevokeAnon = await anon
      .from('regular_customers')
      .select('user_id')
      .eq('cafe_id', cafeId)
    expect(afterRevokeAnon.data).toEqual([])

    const afterRevokeOwner = await owner.client
      .from('regular_customers')
      .select('user_id')
      .eq('cafe_id', cafeId)
    expect(afterRevokeOwner.data).toHaveLength(1)

    const afterRevokeOther = await otherOwner.client
      .from('regular_customers')
      .select('user_id')
      .eq('cafe_id', cafeId)
    expect(afterRevokeOther.data).toEqual([])
  })

  it('認定オーナーは取消（revoked_at 設定）とメモ編集ができる', async () => {
    const cafeId = await insertCafe(owner.userId)
    await owner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: owner.userId })

    const { error, data } = await owner.client
      .from('regular_customers')
      .update({ revoked_at: new Date().toISOString(), note: '取消理由' })
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('取消済みの行は revoked_at IS NOT NULL 条件付きUPDATEで再認定できる（awardRegularの再認定経路）', async () => {
    const cafeId = await insertCafe(owner.userId)
    await owner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: owner.userId })
    await service
      .from('regular_customers')
      .update({ revoked_at: new Date().toISOString() })
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)

    const { data, error } = await owner.client
      .from('regular_customers')
      .update({ awarded_by: owner.userId, note: '再認定', revoked_at: null })
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)
      .not('revoked_at', 'is', null)
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({ revoked_at: null, note: '再認定' })
  })

  it('他人のカフェの認定は更新できない', async () => {
    const cafeId = await insertCafe(owner.userId)
    await owner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: owner.userId })

    const { data } = await otherOwner.client
      .from('regular_customers')
      .update({ revoked_at: new Date().toISOString() })
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)
      .select()

    expect(data).toEqual([])
  })

  it('停止中(suspended)のオーナーは取消・メモ編集ができない', async () => {
    const cafeId = await insertCafe(suspendedOwner.userId)
    await service
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: suspendedOwner.userId })

    const revoked = await suspendedOwner.client
      .from('regular_customers')
      .update({ revoked_at: new Date().toISOString() })
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)
      .select()
    expect(revoked.data).toEqual([])

    const noteUpdated = await suspendedOwner.client
      .from('regular_customers')
      .update({ note: '停止中でも書けてしまうか' })
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)
      .select()
    expect(noteUpdated.data).toEqual([])
  })

  it('削除はできない（履歴保持）', async () => {
    const cafeId = await insertCafe(owner.userId)
    await owner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: owner.userId })

    const { data: deleted } = await owner.client
      .from('regular_customers')
      .delete()
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)
      .select()
    expect(deleted).toEqual([])

    const stillThere = await service
      .from('regular_customers')
      .select('user_id')
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)
    expect(stillThere.data).toHaveLength(1)
  })

  it('認定すると対象ユーザーへ通知が作られる', async () => {
    const cafeId = await insertCafe(owner.userId)
    await owner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: owner.userId })

    const notifications = await service
      .from('notifications')
      .select('type, recipient_id, actor_id')
      .eq('recipient_id', regular.userId)
      .eq('type', 'regular_awarded')
    expect(notifications.data).toHaveLength(1)
    expect(notifications.data?.[0]?.actor_id).toBe(owner.userId)

    await service
      .from('notifications')
      .delete()
      .eq('recipient_id', regular.userId)
      .eq('type', 'regular_awarded')
  })
})

describe('get_regular_candidates', () => {
  it('自店の投稿・コメント・保存数を集計して返す', async () => {
    const cafeId = await insertCafe(owner.userId)
    await insertPost(cafeId, regular.userId, { bookmark_count: 5 })
    const postId = await insertPost(cafeId, regular.userId, { bookmark_count: 2 })
    await insertComment(postId, regular.userId)

    const { data, error } = await owner.client.rpc('get_regular_candidates', { p_cafe_id: cafeId })

    expect(error).toBeNull()
    const row = data?.find((r: { user_id: string }) => r.user_id === regular.userId)
    expect(row).toMatchObject({ post_count: 2, comment_count: 1, bookmark_count: 7 })
  })

  it('既に有効な常連・オーナー自身・非activeユーザーは候補から除外する', async () => {
    const cafeId = await insertCafe(owner.userId)
    await insertPost(cafeId, regular.userId)
    await insertPost(cafeId, owner.userId)
    await insertPost(cafeId, suspended.userId)

    await service
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: owner.userId })

    const { data } = await owner.client.rpc('get_regular_candidates', { p_cafe_id: cafeId })
    const userIds = (data ?? []).map((r: { user_id: string }) => r.user_id)

    expect(userIds).not.toContain(regular.userId)
    expect(userIds).not.toContain(owner.userId)
    expect(userIds).not.toContain(suspended.userId)
  })

  it('オーナー本人以外（admin以外）が呼ぶと FORBIDDEN', async () => {
    const cafeId = await insertCafe(owner.userId)

    const { error } = await otherOwner.client.rpc('get_regular_candidates', { p_cafe_id: cafeId })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })
})

describe('lib/owner/regulars', () => {
  it('getOwnedCafeSummary は本人以外・未ログインには null を返す', async () => {
    const cafeId = await insertCafe(owner.userId)

    expect(await getOwnedCafeSummary(typed(owner.client), cafeId)).toEqual({
      id: cafeId,
      name: 'テスト常連カフェ',
    })
    expect(await getOwnedCafeSummary(typed(otherOwner.client), cafeId)).toBeNull()
    expect(await getOwnedCafeSummary(typed(anon), cafeId)).toBeNull()
  })

  it('getRegularCandidates はオーナー以外に null を返す', async () => {
    const cafeId = await insertCafe(owner.userId)
    await insertPost(cafeId, regular.userId)

    const own = await getRegularCandidates(typed(owner.client), cafeId)
    expect(own?.some((c) => c.userId === regular.userId)).toBe(true)

    expect(await getRegularCandidates(typed(otherOwner.client), cafeId)).toBeNull()
  })

  it('listRegularCustomers は activeOnly で取消済みを除外できる。オーナー以外は空配列', async () => {
    const cafeId = await insertCafe(owner.userId)
    await owner.client
      .from('regular_customers')
      .insert({ user_id: regular.userId, cafe_id: cafeId, awarded_by: owner.userId, note: 'メモ' })

    const active = await listRegularCustomers(typed(owner.client), cafeId, { activeOnly: true })
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ userId: regular.userId, note: 'メモ' })

    await service
      .from('regular_customers')
      .update({ revoked_at: new Date().toISOString() })
      .eq('cafe_id', cafeId)
      .eq('user_id', regular.userId)

    const afterRevoke = await listRegularCustomers(typed(owner.client), cafeId, {
      activeOnly: true,
    })
    expect(afterRevoke).toHaveLength(0)

    const history = await listRegularCustomers(typed(owner.client), cafeId, { activeOnly: false })
    expect(history).toHaveLength(1)

    const otherOwnerView = await listRegularCustomers(typed(otherOwner.client), cafeId, {
      activeOnly: false,
    })
    expect(otherOwnerView).toEqual([])
  })
})
