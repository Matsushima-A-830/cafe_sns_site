import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// app/_actions/drafts.ts（saveDraft / listDrafts / getDraft / deleteDraft）が内部で行う
// drafts への upsert・select・delete を authenticated ロールで直接再現し、
// RLS と drafts_refresh_saved_at トリガーが設計通りに動くか検証する。
// Server Actions 自体は next/headers の cookies() に依存するため直接呼べない
//   supabase/migrations/20260907120300_create_drafts.sql
//   docs/architecture/data-model/tables.md #drafts

const RLS_VIOLATION = '42501'

const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let suspendedUser: AuthedUser

function payload(postId: string, overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    post_id: postId,
    post_type: 'short',
    title: null,
    body_json: { type: 'doc', content: [] },
    tag_ids: [],
    image_paths: [],
    cafe_id: null,
    visibility: 'public',
    ...overrides,
  }
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_drafts' })
  bob = await createAuthedProfile({ username: 'bob_drafts' })
  suspendedUser = await createAuthedProfile({ username: 'suspended_drafts', status: 'suspended' })
})

afterEach(async () => {
  await service
    .from('drafts')
    .delete()
    .in('author_id', [alice.userId, bob.userId, suspendedUser.userId])
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
  await suspendedUser?.cleanup()
})

describe('saveDraft が再現する upsert', () => {
  it('同じ client_draft_key への2回目は行を増やさず payload を上書きする', async () => {
    const key = crypto.randomUUID()
    const postId = crypto.randomUUID()

    const first = await alice.client
      .from('drafts')
      .upsert(
        { author_id: alice.userId, client_draft_key: key, payload: payload(postId) },
        { onConflict: 'author_id,client_draft_key' },
      )
      .select('last_saved_at')
      .single()
    expect(first.error).toBeNull()

    const second = await alice.client
      .from('drafts')
      .upsert(
        {
          author_id: alice.userId,
          client_draft_key: key,
          payload: payload(postId, { title: '2回目' }),
        },
        { onConflict: 'author_id,client_draft_key' },
      )
      .select('last_saved_at, payload')
      .single()

    expect(second.error).toBeNull()
    expect(second.data?.payload).toMatchObject({ title: '2回目', post_id: postId })

    const { count } = await alice.client
      .from('drafts')
      .select('id', { count: 'exact', head: true })
      .eq('client_draft_key', key)
    expect(count).toBe(1)
  })

  it('別ユーザーは同じ client_draft_key を独立して持てる', async () => {
    const key = crypto.randomUUID()

    const forAlice = await alice.client.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: key,
      payload: payload(crypto.randomUUID()),
    })
    const forBob = await bob.client.from('drafts').insert({
      author_id: bob.userId,
      client_draft_key: key,
      payload: payload(crypto.randomUUID()),
    })

    expect(forAlice.error).toBeNull()
    expect(forBob.error).toBeNull()
  })

  it('他人の author_id では insert できない', async () => {
    const { error } = await alice.client.from('drafts').insert({
      author_id: bob.userId,
      client_draft_key: crypto.randomUUID(),
      payload: payload(crypto.randomUUID()),
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('suspended ユーザーは下書きを作れない（is_active_user ガード）', async () => {
    const { error } = await suspendedUser.client.from('drafts').insert({
      author_id: suspendedUser.userId,
      client_draft_key: crypto.randomUUID(),
      payload: payload(crypto.randomUUID()),
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })
})

describe('drafts_refresh_saved_at トリガー', () => {
  it('UPDATE のたびに last_saved_at と expires_at を今から30日先へ引き直す', async () => {
    const key = crypto.randomUUID()
    const postId = crypto.randomUUID()
    const staleExpiry = new Date(Date.now() + 60_000).toISOString()

    // 作成直後に「もうすぐ期限切れ」の行を service role で用意し、
    // 自動保存の UPDATE がそれを引き直すことを確かめる
    await service.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: key,
      payload: payload(postId),
      expires_at: staleExpiry,
    })

    const { data, error } = await alice.client
      .from('drafts')
      .update({ payload: payload(postId, { title: '編集後' }) })
      .eq('client_draft_key', key)
      .select('last_saved_at, expires_at')
      .single()

    expect(error).toBeNull()
    const expiresAt = new Date(data?.expires_at as string).getTime()
    const lastSavedAt = new Date(data?.last_saved_at as string).getTime()
    expect(expiresAt).toBeGreaterThan(new Date(staleExpiry).getTime())
    // 30日 ± 1分（クライアント/DB間の時計差とテストの実行時間を吸収する）
    expect(Math.abs(expiresAt - lastSavedAt - 30 * 24 * 60 * 60 * 1000)).toBeLessThan(60_000)
  })
})

describe('drafts の SELECT / DELETE', () => {
  it('他人の下書きは読めず、削除もできない', async () => {
    const key = crypto.randomUUID()
    await service.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: key,
      payload: payload(crypto.randomUUID()),
    })

    const read = await bob.client.from('drafts').select('id').eq('client_draft_key', key)
    const deleted = await bob.client
      .from('drafts')
      .delete()
      .eq('client_draft_key', key)
      .select('id')
    const anonRead = await anonClient().from('drafts').select('id').eq('client_draft_key', key)

    expect(read.data).toEqual([])
    expect(deleted.data).toEqual([])
    expect(anonRead.data).toEqual([])

    const { count } = await service
      .from('drafts')
      .select('id', { count: 'exact', head: true })
      .eq('client_draft_key', key)
    expect(count).toBe(1)
  })

  it('本人は自分の下書きを削除できる', async () => {
    const key = crypto.randomUUID()
    await alice.client.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: key,
      payload: payload(crypto.randomUUID()),
    })

    const { error } = await alice.client.from('drafts').delete().eq('client_draft_key', key)

    expect(error).toBeNull()
    const { count } = await service
      .from('drafts')
      .select('id', { count: 'exact', head: true })
      .eq('client_draft_key', key)
    expect(count).toBe(0)
  })

  it('期限切れの下書きは listDrafts の expires_at 絞り込みから外れる', async () => {
    const expiredKey = crypto.randomUUID()
    await service.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: expiredKey,
      payload: payload(crypto.randomUUID()),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })

    const { data } = await alice.client
      .from('drafts')
      .select('client_draft_key')
      .gt('expires_at', new Date().toISOString())

    expect(data?.map((row) => row.client_draft_key)).not.toContain(expiredKey)
  })
})
