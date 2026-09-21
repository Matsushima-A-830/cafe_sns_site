import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '@/types/result'
import { POST } from './route'

const { createOwnerDocumentUploadUrlMock, createClientMock } = vi.hoisted(() => ({
  createOwnerDocumentUploadUrlMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/storage/owner-documents', async (importOriginal) => ({
  ...(await importOriginal()),
  createOwnerDocumentUploadUrl: createOwnerDocumentUploadUrlMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

function request(body: unknown) {
  return new Request('http://localhost/api/uploads/owner-document/sign', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/uploads/owner-document/sign', () => {
  it('不正な入力は INVALID_INPUT を返し、createOwnerDocumentUploadUrl を呼ばない', async () => {
    const res = await POST(
      request({ verificationId: 'not-a-uuid', contentType: 'application/pdf', fileSize: -1 }),
    )
    const json: Result<unknown> = await res.json()

    expect(json.ok).toBe(false)
    if (!json.ok) expect(json.error).toBe('INVALID_INPUT')
    expect(res.status).toBe(200)
    expect(createOwnerDocumentUploadUrlMock).not.toHaveBeenCalled()
  })

  it('JSONとしてパースできないボディも INVALID_INPUT を details 付きで返す', async () => {
    const res = await POST(
      new Request('http://localhost/api/uploads/owner-document/sign', {
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
    expect(createOwnerDocumentUploadUrlMock).not.toHaveBeenCalled()
  })

  it('サイズ超過・非対応形式は createOwnerDocumentUploadUrl 側が判定し、そのまま返す', async () => {
    const supabaseStub = {}
    createClientMock.mockResolvedValue(supabaseStub)
    const failure: Result<never> = { ok: false, error: 'FILE_TOO_LARGE' }
    createOwnerDocumentUploadUrlMock.mockResolvedValue(failure)

    const verificationId = '11111111-1111-4111-8111-111111111111'
    const res = await POST(
      request({ verificationId, contentType: 'application/pdf', fileSize: 999_999_999 }),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(failure)
    expect(createOwnerDocumentUploadUrlMock).toHaveBeenCalledWith(supabaseStub, {
      verificationId,
      contentType: 'application/pdf',
      fileSize: 999_999_999,
    })
  })

  it('正しい入力は createOwnerDocumentUploadUrl の結果をそのまま返す', async () => {
    const supabaseStub = { auth: {} }
    createClientMock.mockResolvedValue(supabaseStub)
    const success: Result<{ path: string; signedUrl: string; token: string }> = {
      ok: true,
      data: {
        path: 'user/verification/uuid.pdf',
        signedUrl: 'https://example.com/signed',
        token: 't',
      },
    }
    createOwnerDocumentUploadUrlMock.mockResolvedValue(success)

    const verificationId = '11111111-1111-4111-8111-111111111111'
    const res = await POST(
      request({ verificationId, contentType: 'application/pdf', fileSize: 1024 }),
    )
    const json = await res.json()

    expect(json).toEqual(success)
    expect(createOwnerDocumentUploadUrlMock).toHaveBeenCalledWith(supabaseStub, {
      verificationId,
      contentType: 'application/pdf',
      fileSize: 1024,
    })
  })

  it('createOwnerDocumentUploadUrl の失敗もそのまま返す（HTTP 200固定）', async () => {
    createClientMock.mockResolvedValue({})
    const failure: Result<never> = { ok: false, error: 'UNAUTHENTICATED' }
    createOwnerDocumentUploadUrlMock.mockResolvedValue(failure)

    const verificationId = '11111111-1111-4111-8111-111111111111'
    const res = await POST(
      request({ verificationId, contentType: 'application/pdf', fileSize: 1024 }),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(failure)
  })
})
