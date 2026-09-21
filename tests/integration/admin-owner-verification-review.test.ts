import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

/**
 * S_ADMIN_OWNER_REVIEW の承認/却下フローが実際の RLS・トリガー上で通ることを確認する。
 * 最重要の観点: notifications_insert_admin（20260921030000）は元々 type='report_resolved'
 * 固定だったため、20260921090000 でこの型を広げていなければ admin からの通知INSERTが
 * 静かに RLS(42501) で落ちる。単体テストの mock では検知できないのでここで確かめる
 *   supabase/migrations/20260921090000_admin_owner_verification_review.sql
 */

const RLS_VIOLATION = '42501'

const anon = anonClient()
const service = serviceRoleClient()

let alice: AuthedUser
let admin: AuthedUser

const cafeIds: string[] = []
const verificationIds: string[] = []

const validDocuments = [
  { type: 'business_license', path: 'x/y/a.pdf' },
  { type: 'corporate_registry', path: 'x/y/b.pdf' },
]

async function insertCafe() {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: 'テストカフェ', prefecture: '東京都', city: '渋谷区' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id as string
}

async function insertVerification(userId: string, cafeId: string) {
  const { data, error } = await service
    .from('cafe_owner_verifications')
    .insert({
      user_id: userId,
      cafe_id: cafeId,
      document_urls: validDocuments,
      contact_email: 'alice@example.com',
    })
    .select('id')
    .single()
  if (error || !data)
    throw new Error(`テスト用 cafe_owner_verifications の作成に失敗: ${error?.message}`)
  verificationIds.push(data.id)
  return data.id as string
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_owner_review' })
  admin = await createAuthedProfile({ username: 'admin_owner_review', role: 'admin' })
})

afterAll(async () => {
  await alice?.cleanup()
  await admin?.cleanup()
})

afterEach(async () => {
  if (verificationIds.length) {
    await service.from('notifications').delete().in('entity_id', cafeIds)
    await service.from('cafe_owner_verifications').delete().in('id', verificationIds)
    verificationIds.length = 0
  }
  if (cafeIds.length) {
    await service.from('cafes').delete().in('id', cafeIds)
    cafeIds.length = 0
  }
})

describe('admin による owner_verified / owner_verification_rejected 通知', () => {
  it('admin は owner_verified 通知を直接INSERTできる', async () => {
    const cafeId = await insertCafe()
    await insertVerification(alice.userId, cafeId)

    const { error } = await admin.client.from('notifications').insert({
      recipient_id: alice.userId,
      type: 'owner_verified',
      entity_type: 'cafe',
      entity_id: cafeId,
    })

    expect(error).toBeNull()
  })

  it('admin は owner_verification_rejected 通知を直接INSERTできる', async () => {
    const cafeId = await insertCafe()
    await insertVerification(alice.userId, cafeId)

    const { error } = await admin.client.from('notifications').insert({
      recipient_id: alice.userId,
      type: 'owner_verification_rejected',
      entity_type: 'cafe',
      entity_id: cafeId,
    })

    expect(error).toBeNull()
  })

  it('admin でも許可されていない type の通知は直接INSERTできない', async () => {
    const cafeId = await insertCafe()
    await insertVerification(alice.userId, cafeId)

    const { error } = await admin.client.from('notifications').insert({
      recipient_id: alice.userId,
      type: 'like',
      entity_type: 'cafe',
      entity_id: cafeId,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('admin以外は owner_verified 通知をINSERTできない', async () => {
    const cafeId = await insertCafe()
    await insertVerification(alice.userId, cafeId)

    const { error } = await alice.client.from('notifications').insert({
      recipient_id: alice.userId,
      type: 'owner_verified',
      entity_type: 'cafe',
      entity_id: cafeId,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('未ログインは通知をINSERTできない', async () => {
    const { error } = await anon.from('notifications').insert({
      recipient_id: alice.userId,
      type: 'owner_verified',
      entity_type: 'cafe',
      entity_id: alice.userId,
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })
})

describe('承認フローの3テーブル更新（admin視点）', () => {
  it('admin は verifications→approved / cafes.verified_owner_id / profiles.role=owner をすべて更新できる', async () => {
    const cafeId = await insertCafe()
    const verificationId = await insertVerification(alice.userId, cafeId)

    const updateVerification = await admin.client
      .from('cafe_owner_verifications')
      .update({ status: 'approved', reviewed_by: admin.userId })
      .eq('id', verificationId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    expect(updateVerification.error).toBeNull()
    expect(updateVerification.data).not.toBeNull()

    const updateCafe = await admin.client
      .from('cafes')
      .update({ verified_owner_id: alice.userId })
      .eq('id', cafeId)
      .select('verified_owner_id')
      .maybeSingle()
    expect(updateCafe.error).toBeNull()
    expect(updateCafe.data?.verified_owner_id).toBe(alice.userId)

    const updateProfile = await admin.client
      .from('profiles')
      .update({ role: 'owner' })
      .eq('id', alice.userId)
      .select('role')
      .maybeSingle()
    expect(updateProfile.error).toBeNull()
    expect(updateProfile.data?.role).toBe('owner')

    // 後片付け: role を戻す（他テストへの影響を避ける）
    await service.from('profiles').update({ role: 'general' }).eq('id', alice.userId)
    await service.from('cafes').update({ verified_owner_id: null }).eq('id', cafeId)
  })
})
