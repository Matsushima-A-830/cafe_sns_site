import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

const RLS_VIOLATION = '42501'

const service = serviceRoleClient()

let alice: AuthedUser
let admin: AuthedUser
let hiddenPost: { id: string }
let deletedComment: { id: string }

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_admin_mod' })
  admin = await createAuthedProfile({ username: 'admin_admin_mod', role: 'admin' })

  const { data: post } = await service
    .from('posts')
    .insert({
      author_id: alice.userId,
      body_json: { type: 'doc', content: [] },
      status: 'hidden',
    })
    .select('id')
    .single()
  hiddenPost = post as { id: string }

  const { data: comment } = await service
    .from('comments')
    .insert({ post_id: hiddenPost.id, author_id: alice.userId, body: 'x' })
    .select('id')
    .single()
  deletedComment = comment as { id: string }
  await service
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', deletedComment.id)
})

afterAll(async () => {
  await alice?.cleanup()
  await admin?.cleanup()
})

describe('posts/comments の admin 向け SELECT/UPDATE バイパス', () => {
  it('admin は hidden な投稿を読める', async () => {
    const { data, error } = await admin.client
      .from('posts')
      .select('id')
      .eq('id', hiddenPost.id)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.id).toBe(hiddenPost.id)
  })

  it('本人以外の一般ユーザーは hidden な投稿を読めない', async () => {
    const bob = await createAuthedProfile({ username: 'bob_admin_mod' })
    const { data, error } = await bob.client
      .from('posts')
      .select('id')
      .eq('id', hiddenPost.id)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).toBeNull()
    await bob.cleanup()
  })

  it('admin は削除済みコメントを読める', async () => {
    const { data, error } = await admin.client
      .from('comments')
      .select('id')
      .eq('id', deletedComment.id)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.id).toBe(deletedComment.id)
  })

  it('admin は他人の投稿を非表示から非表示のまま更新できる（status変更）', async () => {
    const { data, error } = await admin.client
      .from('posts')
      .update({ status: 'archived' })
      .eq('id', hiddenPost.id)
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.status).toBe('archived')
  })

  it('admin は他人の削除済みコメントの deleted_at を更新できる', async () => {
    const { data, error } = await admin.client
      .from('comments')
      .update({ deleted_at: null })
      .eq('id', deletedComment.id)
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.deleted_at).toBeNull()
  })
})

describe('audit_logs の RLS', () => {
  it('admin は自分を actor_id として INSERT できる', async () => {
    const { error } = await admin.client.from('audit_logs').insert({
      actor_id: admin.userId,
      action: 'reject_report',
      target_type: 'post',
      target_id: hiddenPost.id,
    })

    expect(error).toBeNull()
  })

  it('admin でも他人を actor_id にした INSERT はできない', async () => {
    const { error } = await admin.client.from('audit_logs').insert({
      actor_id: alice.userId,
      action: 'reject_report',
      target_type: 'post',
      target_id: hiddenPost.id,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('一般ユーザーは INSERT できない', async () => {
    const { error } = await alice.client.from('audit_logs').insert({
      actor_id: alice.userId,
      action: 'reject_report',
      target_type: 'post',
      target_id: hiddenPost.id,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('admin は SELECT できる', async () => {
    const { data, error } = await admin.client.from('audit_logs').select('id')

    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('一般ユーザーは SELECT できない', async () => {
    const { data, error } = await alice.client.from('audit_logs').select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('notifications への admin INSERT', () => {
  it('admin は他人宛ての report_resolved 通知を INSERT できる', async () => {
    const { error } = await admin.client.from('notifications').insert({
      recipient_id: alice.userId,
      type: 'report_resolved',
      entity_type: 'report',
      entity_id: hiddenPost.id,
    })

    expect(error).toBeNull()
  })

  it('一般ユーザーは他人宛ての通知を INSERT できない', async () => {
    const { error } = await alice.client.from('notifications').insert({
      recipient_id: admin.userId,
      type: 'report_resolved',
      entity_type: 'report',
      entity_id: hiddenPost.id,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('admin でも report_resolved 以外の type は INSERT できない（notify_on_like 等のトリガーが守るチェックのバイパス防止）', async () => {
    const { error } = await admin.client.from('notifications').insert({
      recipient_id: alice.userId,
      type: 'like',
      entity_type: 'post',
      entity_id: hiddenPost.id,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })
})
