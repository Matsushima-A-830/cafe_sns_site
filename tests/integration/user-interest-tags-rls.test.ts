import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'

const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let suspendedUser: AuthedUser
let occasionTagIds: string[] = []
let moodTagId: string
let otherTagId: string

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_interest' })
  bob = await createAuthedProfile({ username: 'bob_interest' })
  suspendedUser = await createAuthedProfile({
    username: 'suspended_interest',
    status: 'suspended',
  })

  const occasion = await service
    .from('tags')
    .select('id')
    .eq('category', 'occasion')
    .order('slug')
    .limit(6)
  occasionTagIds = (occasion.data ?? []).map((t) => t.id as string)

  const mood = await service.from('tags').select('id').eq('category', 'mood').limit(1).single()
  moodTagId = mood.data?.id as string

  const other = await service.from('tags').select('id').eq('category', 'other').limit(1).single()
  otherTagId = other.data?.id as string
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
  await suspendedUser?.cleanup()
})

describe('user_interest_tags の RLS', () => {
  it('自分の「好きな気分」を登録できる', async () => {
    const { error } = await alice.client
      .from('user_interest_tags')
      .insert({ user_id: alice.userId, tag_id: occasionTagIds[0] })

    expect(error).toBeNull()
  })

  it('他人になりすまして登録はできない', async () => {
    const { error } = await alice.client
      .from('user_interest_tags')
      .insert({ user_id: bob.userId, tag_id: occasionTagIds[1] })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('status=suspended のユーザーは自分を user_id としても登録できない', async () => {
    const { error } = await suspendedUser.client
      .from('user_interest_tags')
      .insert({ user_id: suspendedUser.userId, tag_id: occasionTagIds[1] })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  // 「同じ気分の人」の集計に使うため、SELECT だけは全公開
  it('他人の「好きな気分」は読める', async () => {
    const { data, error } = await bob.client
      .from('user_interest_tags')
      .select('tag_id')
      .eq('user_id', alice.userId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('自分のものは削除できる / 他人のものは消せない', async () => {
    await bob.client.from('user_interest_tags').insert({
      user_id: bob.userId,
      tag_id: occasionTagIds[0],
    })

    const stolen = await alice.client
      .from('user_interest_tags')
      .delete()
      .eq('user_id', bob.userId)
      .select()
    expect(stolen.data).toEqual([])

    const own = await bob.client
      .from('user_interest_tags')
      .delete()
      .eq('user_id', bob.userId)
      .select()
    expect(own.data).toHaveLength(1)
  })
})

describe('user_interest_tags の制約', () => {
  it('occasion / mood 以外のカテゴリは選べない', async () => {
    const { error } = await alice.client
      .from('user_interest_tags')
      .insert({ user_id: alice.userId, tag_id: otherTagId })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('TAG_CATEGORY_NOT_ALLOWED')
  })

  it('mood は選べる', async () => {
    const { error } = await alice.client
      .from('user_interest_tags')
      .insert({ user_id: alice.userId, tag_id: moodTagId })

    expect(error).toBeNull()
  })

  it('6個目は登録できない（UI の上限5個を DB でも担保）', async () => {
    // ここまでで alice は2個。残り3個を足して上限5個にする
    const fill = occasionTagIds.slice(1, 4).map((tag_id) => ({ user_id: alice.userId, tag_id }))
    const filled = await alice.client.from('user_interest_tags').insert(fill)
    expect(filled.error).toBeNull()

    const { error } = await alice.client
      .from('user_interest_tags')
      .insert({ user_id: alice.userId, tag_id: occasionTagIds[4] })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('INTEREST_TAGS_LIMIT')

    const count = await service
      .from('user_interest_tags')
      .select('tag_id', { count: 'exact', head: true })
      .eq('user_id', alice.userId)
    expect(count.count).toBe(5)
  })
})
