import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const { cleanupReservedPostsMock, createAdminClientMock } = vi.hoisted(() => ({
  cleanupReservedPostsMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/cron/cleanup-reserved-posts', () => ({
  cleanupReservedPosts: cleanupReservedPostsMock,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/env.server', () => ({ serverEnv: { CRON_SECRET: 'test-secret' } }))

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/cleanup-reserved-posts', {
    method: 'POST',
    headers: authorization ? { authorization } : undefined,
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/cron/cleanup-reserved-posts', () => {
  it('Authorization ヘッダが無いと FORBIDDEN を返し（HTTP 200固定）、cleanupReservedPosts を呼ばない', async () => {
    const res = await POST(request())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(cleanupReservedPostsMock).not.toHaveBeenCalled()
  })

  it('シークレットが一致しないと FORBIDDEN を返す', async () => {
    const res = await POST(request('Bearer wrong-secret'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(cleanupReservedPostsMock).not.toHaveBeenCalled()
  })

  it('シークレットが一致すると admin クライアントで cleanupReservedPosts を実行し、結果をそのまま返す', async () => {
    const adminStub = { from: vi.fn() }
    createAdminClientMock.mockReturnValue(adminStub)
    const success = { ok: true, data: { deletedPostCount: 2, deletedImageCount: 3 } }
    cleanupReservedPostsMock.mockResolvedValue(success)

    const res = await POST(request('Bearer test-secret'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(success)
    expect(createAdminClientMock).toHaveBeenCalled()
    expect(cleanupReservedPostsMock).toHaveBeenCalledWith(adminStub)
  })

  it('cleanupReservedPosts が失敗しても HTTP 200 のまま body の ok:false で返す', async () => {
    createAdminClientMock.mockReturnValue({})
    const failure = { ok: false, error: 'INTERNAL_ERROR', details: 'boom' }
    cleanupReservedPostsMock.mockResolvedValue(failure)

    const res = await POST(request('Bearer test-secret'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual(failure)
  })
})
