import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

function request(query?: string) {
  return new NextRequest(`http://localhost/api/consent/confirm${query ?? ''}`)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/consent/confirm', () => {
  it('token が無ければ RPC を呼ばず invalid にリダイレクトする', async () => {
    const res = await GET(request())

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/account/pending?consent=invalid')
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('RPC が true を返せば success にリダイレクトする', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    createClientMock.mockResolvedValue({ rpc })

    const res = await GET(request('?token=abc'))

    expect(rpc).toHaveBeenCalledWith('approve_guardian_consent', { p_token: 'abc' })
    expect(res.headers.get('location')).toBe('http://localhost/account/pending?consent=success')
  })

  it('RPC が false（トークン無効・期限切れ）なら invalid にリダイレクトする', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null })
    createClientMock.mockResolvedValue({ rpc })

    const res = await GET(request('?token=expired'))

    expect(res.headers.get('location')).toBe('http://localhost/account/pending?consent=invalid')
  })

  it('RPC がエラーなら invalid にリダイレクトする', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    createClientMock.mockResolvedValue({ rpc })

    const res = await GET(request('?token=abc'))

    expect(res.headers.get('location')).toBe('http://localhost/account/pending?consent=invalid')
  })
})
