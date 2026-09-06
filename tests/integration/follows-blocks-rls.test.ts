import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const CHECK_VIOLATION = '23514'

const anon = anonClient()
const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let suspendedUser: AuthedUser
let pendingConsentUser: AuthedUser

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_follow' })
  bob = await createAuthedProfile({ username: 'bob_follow' })
  suspendedUser = await createAuthedProfile({ username: 'suspended_follow', status: 'suspended' })
  pendingConsentUser = await createAuthedProfile({
    username: 'pending_follow',
    status: 'pending_consent',
  })
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
  await suspendedUser?.cleanup()
  await pendingConsentUser?.cleanup()
})

describe('follows の RLS', () => {
  it('自分を follower としてフォローできる', async () => {
    const { error } = await alice.client
      .from('follows')
      .insert({ follower_id: alice.userId, followee_id: bob.userId })

    expect(error).toBeNull()
  })

  it('フォロー関係は誰でも読める（フォロワー一覧の表示）', async () => {
    const { data, error } = await anon
      .from('follows')
      .select('follower_id')
      .eq('followee_id', bob.userId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('他人を follower に仕立てたフォローはできない', async () => {
    const { error } = await alice.client
      .from('follows')
      .insert({ follower_id: bob.userId, followee_id: alice.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('自分自身はフォローできない', async () => {
    const { error } = await alice.client
      .from('follows')
      .insert({ follower_id: alice.userId, followee_id: alice.userId })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('status=suspended のユーザーは自分を follower としてもフォローできない', async () => {
    const { error } = await suspendedUser.client
      .from('follows')
      .insert({ follower_id: suspendedUser.userId, followee_id: bob.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  // 未成年の保護者同意待ちアカウント。is_active_user() ガード導入の主目的
  it('status=pending_consent のユーザーは自分を follower としてもフォローできない', async () => {
    const { error } = await pendingConsentUser.client
      .from('follows')
      .insert({ follower_id: pendingConsentUser.userId, followee_id: bob.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('他人のフォローは解除できない（対象0件）', async () => {
    const { data } = await bob.client
      .from('follows')
      .delete()
      .eq('follower_id', alice.userId)
      .select()

    expect(data).toEqual([])

    const after = await service
      .from('follows')
      .select('follower_id')
      .eq('follower_id', alice.userId)
    expect(after.data).toHaveLength(1)
  })

  it('自分のフォローは解除できる', async () => {
    const { data } = await alice.client
      .from('follows')
      .delete()
      .eq('follower_id', alice.userId)
      .select()

    expect(data).toHaveLength(1)
  })
})

describe('blocks の RLS', () => {
  it('自分のブロックは作成・参照できる', async () => {
    const created = await alice.client
      .from('blocks')
      .insert({ blocker_id: alice.userId, blocked_id: bob.userId })
    expect(created.error).toBeNull()

    const { data, error } = await alice.client.from('blocks').select('blocked_id')
    expect(error).toBeNull()
    expect(data).toEqual([{ blocked_id: bob.userId }])
  })

  // ブロックされた側に気づかれないよう、blocks は本人以外から見えてはいけない
  it('ブロックされた側からは見えない', async () => {
    const { data, error } = await bob.client.from('blocks').select('blocker_id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('未ログインからも見えない', async () => {
    const { data, error } = await anon.from('blocks').select('blocker_id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('他人になりすましてブロックはできない', async () => {
    const { error } = await bob.client
      .from('blocks')
      .insert({ blocker_id: alice.userId, blocked_id: bob.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })
})
