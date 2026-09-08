import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createPostImageUploadUrl,
  deletePostImages,
  getPostImagePublicUrl,
} from '../../lib/storage/post-images'
import type { Database } from '../../types/database'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

const bodyJson = { type: 'doc', content: [{ type: 'paragraph', content: [] }] }

const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let postId: string

function asDbClient(user: AuthedUser) {
  return user.client as unknown as SupabaseClient<Database>
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_storage' })
  bob = await createAuthedProfile({ username: 'bob_storage' })

  const post = await service
    .from('posts')
    .insert({ author_id: alice.userId, body_json: bodyJson })
    .select('id')
    .single()
  if (post.error || !post.data)
    throw new Error(`テスト用 posts の作成に失敗: ${post.error?.message}`)
  postId = post.data.id
})

afterAll(async () => {
  await service.from('posts').delete().eq('id', postId)
  await alice.cleanup()
  await bob.cleanup()
})

describe('createPostImageUploadUrl', () => {
  it('本人は自分の author_id 配下に署名付きURLを発行できる', async () => {
    const result = await createPostImageUploadUrl(asDbClient(alice), {
      authorId: alice.userId,
      postId,
      contentType: 'image/webp',
      fileSize: 1024,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.path.startsWith(`${alice.userId}/${postId}/`)).toBe(true)
    expect(result.data.signedUrl).toContain(result.data.path)

    // 実際にアップロードできる（RLS insert を通過し、後続の削除テストにも使う）
    const uploaded = await asDbClient(alice)
      .storage.from('post-images')
      .uploadToSignedUrl(
        result.data.path,
        result.data.token,
        new Blob(['dummy'], { type: 'image/webp' }),
        {
          contentType: 'image/webp',
        },
      )
    expect(uploaded.error).toBeNull()

    const publicUrl = getPostImagePublicUrl(asDbClient(alice), result.data.path)
    expect(publicUrl).toContain(result.data.path)

    const cleanup = await deletePostImages(asDbClient(alice), [result.data.path])
    expect(cleanup.ok).toBe(true)
  })

  it('他人の author_id 配下には署名付きURLを発行できない（storage.objects の RLS）', async () => {
    const result = await createPostImageUploadUrl(asDbClient(bob), {
      authorId: alice.userId,
      postId,
      contentType: 'image/webp',
      fileSize: 1024,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('UPLOAD_FAILED')
  })

  it('サイズ上限超過は Storage を呼ばず FILE_TOO_LARGE を返す', async () => {
    const result = await createPostImageUploadUrl(asDbClient(alice), {
      authorId: alice.userId,
      postId,
      contentType: 'image/webp',
      fileSize: 10 * 1024 * 1024 + 1,
    })
    expect(result).toEqual({ ok: false, error: 'FILE_TOO_LARGE' })
  })

  it('webp 以外の形式は UNSUPPORTED_MEDIA_TYPE を返す', async () => {
    const result = await createPostImageUploadUrl(asDbClient(alice), {
      authorId: alice.userId,
      postId,
      contentType: 'image/png',
      fileSize: 1024,
    })
    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })
})

describe('deletePostImages', () => {
  it('他人が作成したオブジェクトは削除できない（storage.objects の RLS）', async () => {
    const uploaded = await createPostImageUploadUrl(asDbClient(alice), {
      authorId: alice.userId,
      postId,
      contentType: 'image/webp',
      fileSize: 1024,
    })
    expect(uploaded.ok).toBe(true)
    if (!uploaded.ok) return

    await asDbClient(alice)
      .storage.from('post-images')
      .uploadToSignedUrl(
        uploaded.data.path,
        uploaded.data.token,
        new Blob(['dummy'], { type: 'image/webp' }),
        {
          contentType: 'image/webp',
        },
      )

    try {
      const bobDelete = await deletePostImages(asDbClient(bob), [uploaded.data.path])
      // storage.objects の remove は RLS で対象外になった行を黙って除外するだけで
      // エラーにはならないため、削除されずに残っていることを直接確認する
      expect(bobDelete.ok).toBe(true)

      const stillExists = await service.storage
        .from('post-images')
        .list(`${alice.userId}/${postId}`)
      expect(stillExists.data?.some((f) => uploaded.data.path.endsWith(f.name))).toBe(true)
    } finally {
      await deletePostImages(asDbClient(alice), [uploaded.data.path])
    }
  })

  it('空配列は Storage を呼ばず成功扱いにする', async () => {
    const result = await deletePostImages(asDbClient(alice), [])
    expect(result).toEqual({ ok: true, data: null })
  })
})
