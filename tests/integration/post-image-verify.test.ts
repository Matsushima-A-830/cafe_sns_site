import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifyNoGpsExif } from '../../lib/storage/post-image-verify'
import { createPostImageUploadUrl, deletePostImages } from '../../lib/storage/post-images'
import type { Database } from '../../types/database'
import { buildGpsTaggedJpeg, buildPlainJpeg } from '../helpers/gps-jpeg-fixture'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

// A10: processPostImage（クライアント側のEXIF除去）が改造クライアント・実装バグで
// 迂回された場合の保険。実際に post-images バケットへアップロードした画像を
// verifyNoGpsExif で読み直し、exifr.gps() が Node 環境でも正しく動くか（Blobを
// そのまま渡すと FileReader 未定義で例外になるため、必ず arrayBuffer() 経由にする）を含めて検証する
//   docs/product/pending-items.md A10

const bodyJson = { type: 'doc', content: [{ type: 'paragraph', content: [] }] }

const service = serviceRoleClient()

let alice: AuthedUser
let postId: string

function asDbClient(user: AuthedUser) {
  return user.client as unknown as SupabaseClient<Database>
}

async function uploadFixture(bytes: Buffer): Promise<string> {
  const signed = await createPostImageUploadUrl(asDbClient(alice), {
    postId,
    contentType: 'image/webp',
    fileSize: bytes.length,
  })
  if (!signed.ok) throw new Error(`署名付きURLの発行に失敗: ${signed.error}`)

  const uploaded = await asDbClient(alice)
    .storage.from('post-images')
    .uploadToSignedUrl(
      signed.data.path,
      signed.data.token,
      new Blob([new Uint8Array(bytes)], { type: 'image/webp' }),
      { contentType: 'image/webp' },
    )
  if (uploaded.error) throw new Error(`アップロードに失敗: ${uploaded.error.message}`)

  return signed.data.path
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_exif_verify' })

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
  await alice?.cleanup()
})

describe('verifyNoGpsExif', () => {
  it('GPS付きEXIFの画像は EXIF_STRIP_FAILED を返す', async () => {
    const path = await uploadFixture(buildGpsTaggedJpeg())
    try {
      const result = await verifyNoGpsExif(asDbClient(alice), [path])
      expect(result).toEqual({ ok: false, error: 'EXIF_STRIP_FAILED' })
    } finally {
      await deletePostImages(asDbClient(alice), [path])
    }
  })

  it('EXIFの無い画像は成功する', async () => {
    const path = await uploadFixture(buildPlainJpeg())
    try {
      const result = await verifyNoGpsExif(asDbClient(alice), [path])
      expect(result).toEqual({ ok: true, data: null })
    } finally {
      await deletePostImages(asDbClient(alice), [path])
    }
  })

  it('複数枚のうち1枚でもGPSがあれば EXIF_STRIP_FAILED を返す（クリーン→GPS付きの順）', async () => {
    const cleanPath = await uploadFixture(buildPlainJpeg())
    const gpsPath = await uploadFixture(buildGpsTaggedJpeg())
    try {
      const result = await verifyNoGpsExif(asDbClient(alice), [cleanPath, gpsPath])
      expect(result).toEqual({ ok: false, error: 'EXIF_STRIP_FAILED' })
    } finally {
      await deletePostImages(asDbClient(alice), [cleanPath, gpsPath])
    }
  })

  it('空配列は Storage を呼ばず成功扱いにする', async () => {
    const result = await verifyNoGpsExif(asDbClient(alice), [])
    expect(result).toEqual({ ok: true, data: null })
  })

  it('存在しないパスは INTERNAL_ERROR を返す', async () => {
    const result = await verifyNoGpsExif(asDbClient(alice), [
      `${alice.userId}/${postId}/does-not-exist.webp`,
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('INTERNAL_ERROR')
  })
})
