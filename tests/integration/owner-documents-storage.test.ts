import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createOwnerDocumentUploadUrl } from '../../lib/storage/owner-documents'
import type { Database } from '../../types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let admin: AuthedUser
const verificationId = crypto.randomUUID()

function asDbClient(user: AuthedUser) {
  return user.client as unknown as SupabaseClient<Database>
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_owndoc' })
  bob = await createAuthedProfile({ username: 'bob_owndoc' })
  admin = await createAuthedProfile({ username: 'admin_owndoc', role: 'admin' })
})

afterAll(async () => {
  await alice.cleanup()
  await bob.cleanup()
  await admin.cleanup()
})

describe('createOwnerDocumentUploadUrl', () => {
  it('本人は署名付きURLを発行してアップロードできる（user_id はセッションから導出）', async () => {
    const result = await createOwnerDocumentUploadUrl(asDbClient(alice), {
      verificationId,
      contentType: 'application/pdf',
      fileSize: 1024,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.path.startsWith(`${alice.userId}/${verificationId}/`)).toBe(true)

    const uploaded = await asDbClient(alice)
      .storage.from('owner-documents')
      .uploadToSignedUrl(
        result.data.path,
        result.data.token,
        new Blob(['dummy'], { type: 'application/pdf' }),
        { contentType: 'application/pdf' },
      )
    expect(uploaded.error).toBeNull()

    await service.storage.from('owner-documents').remove([result.data.path])
  })

  it('未ログインは UNAUTHENTICATED を返す', async () => {
    const result = await createOwnerDocumentUploadUrl(
      anonClient() as unknown as SupabaseClient<Database>,
      { verificationId, contentType: 'application/pdf', fileSize: 1024 },
    )
    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('サイズ上限超過は Storage を呼ばず FILE_TOO_LARGE を返す', async () => {
    const result = await createOwnerDocumentUploadUrl(asDbClient(alice), {
      verificationId,
      contentType: 'application/pdf',
      fileSize: 10 * 1024 * 1024 + 1,
    })
    expect(result).toEqual({ ok: false, error: 'FILE_TOO_LARGE' })
  })

  it('画像/PDF 以外の形式は UNSUPPORTED_MEDIA_TYPE を返す', async () => {
    const result = await createOwnerDocumentUploadUrl(asDbClient(alice), {
      verificationId,
      contentType: 'text/plain',
      fileSize: 1024,
    })
    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })
})

describe('owner-documents の storage.objects RLS（非公開バケット）', () => {
  let uploadedPath: string

  beforeAll(async () => {
    const uploaded = await createOwnerDocumentUploadUrl(asDbClient(alice), {
      verificationId,
      contentType: 'application/pdf',
      fileSize: 1024,
    })
    if (!uploaded.ok) throw new Error('テスト用書類のアップロードURL発行に失敗')
    await asDbClient(alice)
      .storage.from('owner-documents')
      .uploadToSignedUrl(
        uploaded.data.path,
        uploaded.data.token,
        new Blob(['dummy'], { type: 'application/pdf' }),
        { contentType: 'application/pdf' },
      )
    uploadedPath = uploaded.data.path
  })

  afterAll(async () => {
    await service.storage.from('owner-documents').remove([uploadedPath])
  })

  it('本人は自分のフォルダを list() できる', async () => {
    const result = await asDbClient(alice)
      .storage.from('owner-documents')
      .list(`${alice.userId}/${verificationId}`)
    expect(result.data?.some((f) => uploadedPath.endsWith(f.name))).toBe(true)
  })

  it('他人は list() しても見えない（post-images と違い非公開バケットなので公開URLも無い）', async () => {
    const result = await asDbClient(bob)
      .storage.from('owner-documents')
      .list(`${alice.userId}/${verificationId}`)
    expect(result.data ?? []).toEqual([])
  })

  it('匿名ユーザーは list() しても見えない', async () => {
    const result = await (anonClient() as unknown as SupabaseClient<Database>).storage
      .from('owner-documents')
      .list(`${alice.userId}/${verificationId}`)
    expect(result.data ?? []).toEqual([])
  })

  it('admin は list() できる（本人+admin限定のSELECT）', async () => {
    const result = await asDbClient(admin)
      .storage.from('owner-documents')
      .list(`${alice.userId}/${verificationId}`)
    expect(result.data?.some((f) => uploadedPath.endsWith(f.name))).toBe(true)
  })

  it('他人は削除できない', async () => {
    const result = await asDbClient(bob).storage.from('owner-documents').remove([uploadedPath])
    expect(result.error).toBeNull() // RLS対象外は黙って除外されるだけでエラーにはならない

    const stillExists = await service.storage
      .from('owner-documents')
      .list(`${alice.userId}/${verificationId}`)
    expect(stillExists.data?.some((f) => uploadedPath.endsWith(f.name))).toBe(true)
  })
})
