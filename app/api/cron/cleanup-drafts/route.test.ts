import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const { cleanupExpiredDraftsMock, createAdminClientMock } = vi.hoisted(() => ({
  cleanupExpiredDraftsMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/cron/cleanup-expired-drafts', () => ({
  cleanupExpiredDrafts: cleanupExpiredDraftsMock,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/env.server', () => ({ serverEnv: { CRON_SECRET: 'test-secret' } }))

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/cleanup-drafts', {
    method: 'POST',
    headers: authorization ? { authorization } : undefined,
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/cron/cleanup-drafts', () => {
  it('Authorization ヘッダが無いと FORBIDDEN を返し（HTTP 200固定）、cleanupExpiredDrafts を呼ばない', async () => {
    const res = await POST(request())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(cleanupExpiredDraftsMock).not.toHaveBeenCalled()
  })

  it('シークレットが一致しないと FORBIDDEN を返す', async () => {
    const res = await POST(request('Bearer wrong-secret'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(cleanupExpiredDraftsMock).not.toHaveBeenCalled()
  })

  it('シークレットが一致すると admin クライアントで cleanupExpiredDrafts を実行し、結果をそのまま返す', async () => {
    const adminStub = { from: vi.fn() }
    createAdminClientMock.mockReturnValue(adminStub)
    const success = { ok: true, data: { deletedDraftCount: 2, deletedImageCount: 3 } }
    cleanupExpiredDraftsMock.mockResolvedValue(success)

    const res = await POST(request('Bearer test-secret'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(success)
    expect(createAdminClientMock).toHaveBeenCalled()
    expect(cleanupExpiredDraftsMock).toHaveBeenCalledWith(adminStub)
  })

  it('cleanupExpiredDrafts が失敗しても HTTP 200 のまま body の ok:false で返す', async () => {
    createAdminClientMock.mockReturnValue({})
    const failure = { ok: false, error: 'INTERNAL_ERROR', details: 'boom' }
    cleanupExpiredDraftsMock.mockResolvedValue(failure)

    const res = await POST(request('Bearer test-secret'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(failure)
  })
})
