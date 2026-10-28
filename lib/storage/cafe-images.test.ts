import { describe, expect, it, vi } from 'vitest'
import {
  buildCafeImagePath,
  CAFE_IMAGE_MAX_BYTES,
  createCafeImageUploadUrl,
  validateCafeImageUpload,
} from './cafe-images'

const userId = 'user-1'
const cafeId = 'cafe-1'

function buildSupabaseStub(
  options: {
    user?: { id: string } | null
    isOwnerResult?: { data?: boolean; error?: unknown }
    isAdminResult?: { data?: boolean; error?: unknown }
    signResult?: {
      data: { path: string; signedUrl: string; token: string } | null
      error?: unknown
    }
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const isOwnerResult = options.isOwnerResult ?? { data: true, error: null }
  const isAdminResult = options.isAdminResult ?? { data: false, error: null }
  const signResult = options.signResult ?? {
    data: { path: `${cafeId}/new.webp`, signedUrl: 'https://signed', token: 'token' },
    error: null,
  }

  const rpc = vi.fn((fn: string) =>
    Promise.resolve(fn === 'is_cafe_owner' ? isOwnerResult : isAdminResult),
  )
  const createSignedUploadUrl = vi.fn().mockResolvedValue(signResult)
  const storage = { from: vi.fn(() => ({ createSignedUploadUrl })) }

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    rpc,
    storage,
  }
}

describe('buildCafeImagePath', () => {
  it('先頭セグメントを cafeId に固定した webp パスを生成する', () => {
    const path = buildCafeImagePath('cafe-1')
    expect(path).toMatch(
      /^cafe-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/,
    )
  })

  it('呼び出すたびに異なるファイル名になる', () => {
    const first = buildCafeImagePath('cafe-1')
    const second = buildCafeImagePath('cafe-1')
    expect(first).not.toBe(second)
  })
})

describe('validateCafeImageUpload', () => {
  it('image/webp かつ上限以下なら通す', () => {
    const result = validateCafeImageUpload({ contentType: 'image/webp', fileSize: 1024 })
    expect(result).toEqual({ ok: true, data: null })
  })

  it('webp 以外は UNSUPPORTED_MEDIA_TYPE', () => {
    const result = validateCafeImageUpload({ contentType: 'image/jpeg', fileSize: 1024 })
    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })

  it('上限ちょうどは通す', () => {
    const result = validateCafeImageUpload({
      contentType: 'image/webp',
      fileSize: CAFE_IMAGE_MAX_BYTES,
    })
    expect(result.ok).toBe(true)
  })

  it('上限超過は FILE_TOO_LARGE', () => {
    const result = validateCafeImageUpload({
      contentType: 'image/webp',
      fileSize: CAFE_IMAGE_MAX_BYTES + 1,
    })
    expect(result).toEqual({ ok: false, error: 'FILE_TOO_LARGE' })
  })

  it('形式違反はサイズより先に検出する', () => {
    const result = validateCafeImageUpload({
      contentType: 'image/jpeg',
      fileSize: CAFE_IMAGE_MAX_BYTES + 1,
    })
    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })
})

describe('createCafeImageUploadUrl', () => {
  const params = { cafeId, contentType: 'image/webp', fileSize: 1024 }

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const stub = buildSupabaseStub({ user: null })

    // biome-ignore lint/suspicious/noExplicitAny: 最小限のスタブなので SupabaseClient 全体の型は満たさない
    const result = await createCafeImageUploadUrl(stub as any, params)

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('is_cafe_owner・is_admin がどちらも false なら FORBIDDEN を返す（他人のカフェID）', async () => {
    const stub = buildSupabaseStub({ isOwnerResult: { data: false, error: null } })

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await createCafeImageUploadUrl(stub as any, params)

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(stub.rpc).toHaveBeenCalledWith('is_cafe_owner', { p_cafe_id: cafeId })
  })

  it('is_cafe_owner の RPC が失敗したら INTERNAL_ERROR を返す', async () => {
    const stub = buildSupabaseStub({
      isOwnerResult: { data: undefined, error: { message: 'boom' } },
    })

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await createCafeImageUploadUrl(stub as any, params)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
  })

  it('is_admin の RPC が失敗したら INTERNAL_ERROR を返す', async () => {
    const stub = buildSupabaseStub({
      isAdminResult: { data: undefined, error: { message: 'boom' } },
    })

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await createCafeImageUploadUrl(stub as any, params)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })
  })

  it('本人のカフェでなくても admin なら署名付きURLを返す（モデレーション用途）', async () => {
    const stub = buildSupabaseStub({
      isOwnerResult: { data: false, error: null },
      isAdminResult: { data: true, error: null },
    })

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await createCafeImageUploadUrl(stub as any, params)

    expect(result.ok).toBe(true)
  })

  it('本人のカフェなら cafeId を先頭セグメントにした署名付きURLを返す', async () => {
    const stub = buildSupabaseStub()

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await createCafeImageUploadUrl(stub as any, params)

    expect(result.ok).toBe(true)
    expect(stub.storage.from).toHaveBeenCalledWith('cafe-images')
  })

  it('サイズ上限超過は RPC を呼ばず FILE_TOO_LARGE を返す', async () => {
    const stub = buildSupabaseStub()

    const result = await createCafeImageUploadUrl(
      // biome-ignore lint/suspicious/noExplicitAny: 同上
      stub as any,
      { ...params, fileSize: CAFE_IMAGE_MAX_BYTES + 1 },
    )

    expect(result).toEqual({ ok: false, error: 'FILE_TOO_LARGE' })
    expect(stub.rpc).not.toHaveBeenCalled()
  })
})
