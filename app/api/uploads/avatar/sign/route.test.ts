import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '@/types/result'
import { POST } from './route'

const { createAvatarUploadUrlMock, createClientMock } = vi.hoisted(() => ({
  createAvatarUploadUrlMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/storage/avatars', async (importOriginal) => ({
  ...(await importOriginal()),
  createAvatarUploadUrl: createAvatarUploadUrlMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

function request(body: unknown) {
  return new Request('http://localhost/api/uploads/avatar/sign', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/uploads/avatar/sign', () => {
  it('不正な入力は INVALID_INPUT を返し、createAvatarUploadUrl を呼ばない', async () => {
    const res = await POST(request({ contentType: 'image/webp', fileSize: -1 }))
    const json: Result<unknown> = await res.json()

    expect(json.ok).toBe(false)
    if (!json.ok) expect(json.error).toBe('INVALID_INPUT')
    expect(res.status).toBe(200)
    expect(createAvatarUploadUrlMock).not.toHaveBeenCalled()
  })

  it('JSONとしてパースできないボディも INVALID_INPUT を details 付きで返す', async () => {
    const res = await POST(
      new Request('http://localhost/api/uploads/avatar/sign', {
        method: 'POST',
        body: '{invalid',
      }),
    )
    const json: Result<unknown> = await res.json()

    expect(json.ok).toBe(false)
    if (!json.ok) {
      expect(json.error).toBe('INVALID_INPUT')
      expect(json.details).toBeDefined()
    }
    expect(createAvatarUploadUrlMock).not.toHaveBeenCalled()
  })

  it('サイズ超過・非対応形式は createAvatarUploadUrl 側が判定し、そのまま返す', async () => {
    const supabaseStub = {}
    createClientMock.mockResolvedValue(supabaseStub)
    const failure: Result<never> = { ok: false, error: 'FILE_TOO_LARGE' }
    createAvatarUploadUrlMock.mockResolvedValue(failure)

    const res = await POST(request({ contentType: 'image/webp', fileSize: 999_999_999 }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(failure)
    expect(createAvatarUploadUrlMock).toHaveBeenCalledWith(supabaseStub, {
      contentType: 'image/webp',
      fileSize: 999_999_999,
    })
  })

  it('正しい入力は createAvatarUploadUrl の結果をそのまま返す', async () => {
    const supabaseStub = { auth: {} }
    createClientMock.mockResolvedValue(supabaseStub)
    const success: Result<{ path: string; signedUrl: string; token: string }> = {
      ok: true,
      data: { path: 'user/uuid.webp', signedUrl: 'https://example.com/signed', token: 't' },
    }
    createAvatarUploadUrlMock.mockResolvedValue(success)

    const res = await POST(request({ contentType: 'image/webp', fileSize: 1024 }))
    const json = await res.json()

    expect(json).toEqual(success)
    expect(createAvatarUploadUrlMock).toHaveBeenCalledWith(supabaseStub, {
      contentType: 'image/webp',
      fileSize: 1024,
    })
  })

  it('createAvatarUploadUrl の失敗もそのまま返す（HTTP 200固定）', async () => {
    createClientMock.mockResolvedValue({})
    const failure: Result<never> = { ok: false, error: 'UNAUTHENTICATED' }
    createAvatarUploadUrlMock.mockResolvedValue(failure)

    const res = await POST(request({ contentType: 'image/webp', fileSize: 1024 }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(failure)
  })
})
