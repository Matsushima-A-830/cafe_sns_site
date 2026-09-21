import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'

const anon = anonClient()
const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let admin: AuthedUser

const cafeIds: string[] = []
const verificationIds: string[] = []

async function insertCafe(overrides: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: 'テストカフェ', prefecture: '東京都', city: '渋谷区', ...overrides })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id as string
}

const validDocuments = [
  { type: 'business_license', path: 'x/y/a.pdf' },
  { type: 'corporate_registry', path: 'x/y/b.pdf' },
]

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_owner_claim' })
  bob = await createAuthedProfile({ username: 'bob_owner_claim' })
  admin = await createAuthedProfile({ username: 'admin_owner_claim', role: 'admin' })
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
  await admin?.cleanup()
})

afterEach(async () => {
  if (verificationIds.length) {
    await service.from('cafe_owner_verifications').delete().in('id', verificationIds)
    verificationIds.length = 0
  }
  if (cafeIds.length) {
    await service.from('cafes').delete().in('id', cafeIds)
    cafeIds.length = 0
  }
})

describe('cafe_owner_verifications の RLS・制約', () => {
  it('本人として申請を作成できる', async () => {
    const cafeId = await insertCafe()

    const { data, error } = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    if (data) verificationIds.push(data.id)
  })

  it('他人になりすました申請はできない', async () => {
    const cafeId = await insertCafe()

    const { error } = await alice.client.from('cafe_owner_verifications').insert({
      user_id: bob.userId,
      cafe_id: cafeId,
      document_urls: validDocuments,
      contact_email: 'alice@example.com',
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('書類が2点未満だと CHECK 制約で弾かれる', async () => {
    const cafeId = await insertCafe()

    const { error } = await alice.client.from('cafe_owner_verifications').insert({
      user_id: alice.userId,
      cafe_id: cafeId,
      document_urls: [validDocuments[0]],
      contact_email: 'alice@example.com',
    })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('同一カフェへの pending 申請は重複できない', async () => {
    const cafeId = await insertCafe()

    const first = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()
    expect(first.error).toBeNull()
    if (first.data) verificationIds.push(first.data.id)

    const { error } = await bob.client.from('cafe_owner_verifications').insert({
      user_id: bob.userId,
      cafe_id: cafeId,
      document_urls: validDocuments,
      contact_email: 'bob@example.com',
    })

    expect(error?.code).toBe(UNIQUE_VIOLATION)
  })

  it('resolved（withdrawn）後は同じカフェへ再申請できる', async () => {
    const cafeId = await insertCafe()

    const first = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()
    if (first.data) verificationIds.push(first.data.id)

    await service
      .from('cafe_owner_verifications')
      .update({ status: 'withdrawn' })
      .eq('id', first.data?.id)

    const second = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()

    expect(second.error).toBeNull()
    if (second.data) verificationIds.push(second.data.id)
  })

  it('既に verified_owner_id が付いたカフェへの申請はトリガーで弾かれる（CAFE_ALREADY_CLAIMED）', async () => {
    const cafeId = await insertCafe()
    await service.from('cafes').update({ verified_owner_id: bob.userId }).eq('id', cafeId)

    const { error } = await alice.client.from('cafe_owner_verifications').insert({
      user_id: alice.userId,
      cafe_id: cafeId,
      document_urls: validDocuments,
      contact_email: 'alice@example.com',
    })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('CAFE_ALREADY_CLAIMED')
  })

  it('本人は自分の申請を読めるが、他人の申請は読めない。admin は読める', async () => {
    const cafeId = await insertCafe()
    const { data } = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()
    if (data) verificationIds.push(data.id)

    const own = await alice.client.from('cafe_owner_verifications').select('id').eq('id', data?.id)
    expect(own.data?.length).toBe(1)

    const others = await bob.client.from('cafe_owner_verifications').select('id').eq('id', data?.id)
    expect(others.data).toEqual([])

    const anonRead = await anon.from('cafe_owner_verifications').select('id').eq('id', data?.id)
    expect(anonRead.data).toEqual([])

    const asAdmin = await admin.client
      .from('cafe_owner_verifications')
      .select('id')
      .eq('id', data?.id)
    expect(asAdmin.data?.length).toBe(1)
  })

  it('本人は pending から withdrawn への更新のみできる（他フィールドへの変更は通らない）', async () => {
    const cafeId = await insertCafe()
    const { data } = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()
    if (data) verificationIds.push(data.id)

    // WITH CHECK は USING と違って「合致する行が無い」では済まず、更新後の行が
    // どのポリシーの WITH CHECK も満たさない場合はエラーになる（Postgres の仕様）
    const toApproved = await alice.client
      .from('cafe_owner_verifications')
      .update({ status: 'approved' })
      .eq('id', data?.id)
      .select()
    expect(toApproved.error?.code).toBe(RLS_VIOLATION)

    const toWithdrawn = await alice.client
      .from('cafe_owner_verifications')
      .update({ status: 'withdrawn' })
      .eq('id', data?.id)
      .select()
    expect(toWithdrawn.error).toBeNull()
    expect(toWithdrawn.data).toHaveLength(1)
  })

  it('本人は他人の申請を更新できない', async () => {
    const cafeId = await insertCafe()
    const { data } = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()
    if (data) verificationIds.push(data.id)

    const { data: updated } = await bob.client
      .from('cafe_owner_verifications')
      .update({ status: 'withdrawn' })
      .eq('id', data?.id)
      .select()
    expect(updated).toEqual([])
  })

  it('admin は任意の申請を審査（status更新）できる', async () => {
    const cafeId = await insertCafe()
    const { data } = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()
    if (data) verificationIds.push(data.id)

    const { data: updated, error } = await admin.client
      .from('cafe_owner_verifications')
      .update({ status: 'rejected', review_notes: '書類不備', reviewed_by: admin.userId })
      .eq('id', data?.id)
      .select()

    expect(error).toBeNull()
    expect(updated).toHaveLength(1)
  })

  it('get_owner_verification_cafe は自分の申請先カフェを status に関わらず返す', async () => {
    const cafeId = await insertCafe()
    const { data } = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()
    if (data) verificationIds.push(data.id)

    // カフェが closed になっても、申請者本人からは見えることを確認する
    await service.from('cafes').update({ status: 'closed' }).eq('id', cafeId)

    const own = await alice.client
      .rpc('get_owner_verification_cafe', { p_cafe_id: cafeId })
      .maybeSingle()
    expect(own.error).toBeNull()
    expect((own.data as { id: string } | null)?.id).toBe(cafeId)

    const others = await bob.client
      .rpc('get_owner_verification_cafe', { p_cafe_id: cafeId })
      .maybeSingle()
    expect(others.data).toBeNull()
  })

  it('削除はできない（履歴保持）', async () => {
    const cafeId = await insertCafe()
    const { data } = await alice.client
      .from('cafe_owner_verifications')
      .insert({
        user_id: alice.userId,
        cafe_id: cafeId,
        document_urls: validDocuments,
        contact_email: 'alice@example.com',
      })
      .select('id')
      .single()
    if (data) verificationIds.push(data.id)

    const { data: deleted } = await alice.client
      .from('cafe_owner_verifications')
      .delete()
      .eq('id', data?.id)
      .select()
    expect(deleted).toEqual([])

    const stillThere = await service
      .from('cafe_owner_verifications')
      .select('id')
      .eq('id', data?.id)
    expect(stillThere.data).toHaveLength(1)
  })
})
