import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAvatarUploadUrl, deleteAvatarFile } from '../../lib/storage/avatars'
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

function asDbClient(user: AuthedUser) {
  return user.client as unknown as SupabaseClient<Database>
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_avatar' })
  bob = await createAuthedProfile({ username: 'bob_avatar' })
})

afterAll(async () => {
  await alice.cleanup()
  await bob.cleanup()
})

describe('createAvatarUploadUrl', () => {
  it('本人は署名付きURLを発行してアップロードできる（user_id はセッションから導出）', async () => {
    const result = await createAvatarUploadUrl(asDbClient(alice), {
      contentType: 'image/webp',
      fileSize: 1024,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.path.startsWith(`${alice.userId}/`)).toBe(true)

    const uploaded = await asDbClient(alice)
      .storage.from('avatars')
      .uploadToSignedUrl(
        result.data.path,
        result.data.token,
        new Blob(['dummy'], { type: 'image/webp' }),
        { contentType: 'image/webp' },
      )
    expect(uploaded.error).toBeNull()

    await service.storage.from('avatars').remove([result.data.path])
  })

  it('未ログインは UNAUTHENTICATED を返す', async () => {
    const result = await createAvatarUploadUrl(
      anonClient() as unknown as SupabaseClient<Database>,
      {
        contentType: 'image/webp',
        fileSize: 1024,
      },
    )
    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('サイズ上限超過は Storage を呼ばず FILE_TOO_LARGE を返す', async () => {
    const result = await createAvatarUploadUrl(asDbClient(alice), {
      contentType: 'image/webp',
      fileSize: 2 * 1024 * 1024 + 1,
    })
    expect(result).toEqual({ ok: false, error: 'FILE_TOO_LARGE' })
  })

  it('webp 以外の形式は UNSUPPORTED_MEDIA_TYPE を返す', async () => {
    const result = await createAvatarUploadUrl(asDbClient(alice), {
      contentType: 'image/jpeg',
      fileSize: 1024,
    })
    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })
})

describe('avatars の storage.objects RLS（公開バケット）', () => {
  let uploadedPath: string

  beforeAll(async () => {
    const uploaded = await createAvatarUploadUrl(asDbClient(alice), {
      contentType: 'image/webp',
      fileSize: 1024,
    })
    if (!uploaded.ok) throw new Error('テスト用アバターのアップロードURL発行に失敗')
    await asDbClient(alice)
      .storage.from('avatars')
      .uploadToSignedUrl(
        uploaded.data.path,
        uploaded.data.token,
        new Blob(['dummy'], { type: 'image/webp' }),
        { contentType: 'image/webp' },
      )
    uploadedPath = uploaded.data.path
  })

  afterAll(async () => {
    await service.storage.from('avatars').remove([uploadedPath])
  })

  it('本人は自分のフォルダを list() できる', async () => {
    const result = await asDbClient(alice).storage.from('avatars').list(alice.userId)
    expect(result.data?.some((f) => uploadedPath.endsWith(f.name))).toBe(true)
  })

  it('他人は list() しても見えない（公開URL経由の読み取りとは別物）', async () => {
    const result = await asDbClient(bob).storage.from('avatars').list(alice.userId)
    expect(result.data ?? []).toEqual([])
  })

  it('他人は削除できない', async () => {
    const result = await asDbClient(bob).storage.from('avatars').remove([uploadedPath])
    expect(result.error).toBeNull() // RLS対象外は黙って除外されるだけでエラーにはならない

    const stillExists = await service.storage.from('avatars').list(alice.userId)
    expect(stillExists.data?.some((f) => uploadedPath.endsWith(f.name))).toBe(true)
  })

  it('本人は deleteAvatarFile で削除できる', async () => {
    const deleted = await deleteAvatarFile(asDbClient(alice), uploadedPath)
    expect(deleted).toEqual({ ok: true, data: null })

    const stillExists = await service.storage.from('avatars').list(alice.userId)
    expect(stillExists.data?.some((f) => uploadedPath.endsWith(f.name))).toBe(false)
  })
})
