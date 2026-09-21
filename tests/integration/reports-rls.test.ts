import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'

const anon = anonClient()
const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let admin: AuthedUser
let targetPost: { id: string }

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_report' })
  bob = await createAuthedProfile({ username: 'bob_report' })
  admin = await createAuthedProfile({ username: 'admin_report', role: 'admin' })

  const { data: post } = await service
    .from('posts')
    .insert({
      author_id: bob.userId,
      body_json: { type: 'doc', content: [] },
      status: 'published',
    })
    .select('id')
    .single()
  targetPost = post as { id: string }
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
  await admin?.cleanup()
})

describe('reports の RLS', () => {
  it('本人として通報を作成できる', async () => {
    const { error } = await alice.client.from('reports').insert({
      reporter_id: alice.userId,
      target_type: 'post',
      target_id: targetPost.id,
      reason: 'spam',
    })

    expect(error).toBeNull()
  })

  it('他人になりすました通報はできない', async () => {
    const { error } = await alice.client.from('reports').insert({
      reporter_id: bob.userId,
      target_type: 'user',
      target_id: bob.userId,
      reason: 'other',
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('自分自身をユーザーとして通報できない', async () => {
    const { error } = await alice.client.from('reports').insert({
      reporter_id: alice.userId,
      target_type: 'user',
      target_id: alice.userId,
      reason: 'other',
    })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('同一対象への未処理の重複通報はできない', async () => {
    const { error } = await alice.client.from('reports').insert({
      reporter_id: alice.userId,
      target_type: 'post',
      target_id: targetPost.id,
      reason: 'harassment',
    })

    expect(error?.code).toBe(UNIQUE_VIOLATION)
  })

  it('resolved 済みの対象は再通報できる', async () => {
    await service
      .from('reports')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('reporter_id', alice.userId)
      .eq('target_id', targetPost.id)

    const { error } = await alice.client.from('reports').insert({
      reporter_id: alice.userId,
      target_type: 'post',
      target_id: targetPost.id,
      reason: 'privacy',
    })

    expect(error).toBeNull()
  })

  it('通報者本人は自分の通報を読める', async () => {
    const { data, error } = await alice.client
      .from('reports')
      .select('id')
      .eq('reporter_id', alice.userId)

    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('他人の通報は読めない', async () => {
    const { data, error } = await bob.client
      .from('reports')
      .select('id')
      .eq('reporter_id', alice.userId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('未ログインからは読めない', async () => {
    const { data, error } = await anon.from('reports').select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('admin は他人の通報を読める', async () => {
    const { data, error } = await admin.client
      .from('reports')
      .select('id')
      .eq('reporter_id', alice.userId)

    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('本人は通報の status を更新できない', async () => {
    const { data } = await alice.client
      .from('reports')
      .update({ status: 'rejected' })
      .eq('reporter_id', alice.userId)
      .eq('target_id', targetPost.id)
      .eq('status', 'pending')
      .select()

    expect(data).toEqual([])
  })

  it('admin は通報の status を更新できる', async () => {
    const { data, error } = await admin.client
      .from('reports')
      .update({ status: 'rejected', reviewer_id: admin.userId })
      .eq('reporter_id', alice.userId)
      .eq('target_id', targetPost.id)
      .eq('status', 'pending')
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})
