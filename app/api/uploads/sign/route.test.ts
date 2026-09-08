import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '@/types/result'
import { POST } from './route'

const { createPostImageUploadUrlMock, createClientMock } = vi.hoisted(() => ({
  createPostImageUploadUrlMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/storage/post-images', async (importOriginal) => ({
  ...(await importOriginal()),
  createPostImageUploadUrl: createPostImageUploadUrlMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

function request(body: unknown) {
  return new Request('http://localhost/api/uploads/sign', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/uploads/sign', () => {
  it('不正な入力は INVALID_INPUT を返し、createPostImageUploadUrl を呼ばない', async () => {
    const res = await POST(
      request({ postId: 'not-a-uuid', contentType: 'image/png', fileSize: -1 }),
    )
    const json: Result<unknown> = await res.json()

    expect(json.ok).toBe(false)
    if (!json.ok) expect(json.error).toBe('INVALID_INPUT')
    expect(res.status).toBe(200)
    expect(createPostImageUploadUrlMock).not.toHaveBeenCalled()
  })

  it('JSONとしてパースできないボディも INVALID_INPUT を details 付きで返す', async () => {
    const res = await POST(
      new Request('http://localhost/api/uploads/sign', { method: 'POST', body: '{invalid' }),
    )
    const json: Result<unknown> = await res.json()

    expect(json.ok).toBe(false)
    if (!json.ok) {
      expect(json.error).toBe('INVALID_INPUT')
      expect(json.details).toBeDefined()
    }
    expect(createPostImageUploadUrlMock).not.toHaveBeenCalled()
  })

  it('サイズ超過・非対応形式は createPostImageUploadUrl 側（validatePostImageUpload）が判定し、そのまま返す', async () => {
    const supabaseStub = {}
    createClientMock.mockResolvedValue(supabaseStub)
    const failure: Result<never> = { ok: false, error: 'FILE_TOO_LARGE' }
    createPostImageUploadUrlMock.mockResolvedValue(failure)

    const postId = '11111111-1111-4111-8111-111111111111'
    const res = await POST(request({ postId, contentType: 'image/png', fileSize: 999_999_999 }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(failure)
    expect(createPostImageUploadUrlMock).toHaveBeenCalledWith(supabaseStub, {
      postId,
      contentType: 'image/png',
      fileSize: 999_999_999,
    })
  })

  it('正しい入力は createPostImageUploadUrl の結果をそのまま返す', async () => {
    const supabaseStub = { auth: {} }
    createClientMock.mockResolvedValue(supabaseStub)
    const success: Result<{ path: string; signedUrl: string; token: string }> = {
      ok: true,
      data: { path: 'author/post/uuid.webp', signedUrl: 'https://example.com/signed', token: 't' },
    }
    createPostImageUploadUrlMock.mockResolvedValue(success)

    const postId = '11111111-1111-4111-8111-111111111111'
    const res = await POST(request({ postId, contentType: 'image/webp', fileSize: 1024 }))
    const json = await res.json()

    expect(json).toEqual(success)
    expect(createPostImageUploadUrlMock).toHaveBeenCalledWith(supabaseStub, {
      postId,
      contentType: 'image/webp',
      fileSize: 1024,
    })
  })

  it('createPostImageUploadUrl の失敗もそのまま返す（HTTP 200固定）', async () => {
    createClientMock.mockResolvedValue({})
    const failure: Result<never> = { ok: false, error: 'UNAUTHENTICATED' }
    createPostImageUploadUrlMock.mockResolvedValue(failure)

    const postId = '11111111-1111-4111-8111-111111111111'
    const res = await POST(request({ postId, contentType: 'image/webp', fileSize: 1024 }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(failure)
  })
})
