import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const { createAnonClientMock } = vi.hoisted(() => ({ createAnonClientMock: vi.fn() }))

vi.mock('@/lib/supabase/anon', () => ({ createAnonClient: createAnonClientMock }))

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
    expect(createAnonClientMock).not.toHaveBeenCalled()
  })

  it('RPC が true を返せば success にリダイレクトする', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    createAnonClientMock.mockReturnValue({ rpc })

    const res = await GET(request('?token=abc'))

    expect(rpc).toHaveBeenCalledWith('approve_guardian_consent', { p_token: 'abc' })
    expect(res.headers.get('location')).toBe('http://localhost/account/pending?consent=success')
  })

  it('RPC が false（トークン無効・期限切れ）なら invalid にリダイレクトする', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null })
    createAnonClientMock.mockReturnValue({ rpc })

    const res = await GET(request('?token=expired'))

    expect(res.headers.get('location')).toBe('http://localhost/account/pending?consent=invalid')
  })

  it('RPC がエラーなら invalid にリダイレクトする', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    createAnonClientMock.mockReturnValue({ rpc })

    const res = await GET(request('?token=abc'))

    expect(res.headers.get('location')).toBe('http://localhost/account/pending?consent=invalid')
  })

  it('cookieに何らかのセッションがあっても影響しないよう、cookieを見ないクライアントを使う', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    createAnonClientMock.mockReturnValue({ rpc })

    await GET(request('?token=abc'))

    // createAnonClient は cookies() を受け取らない設計であること自体がテスト対象。
    // 呼び出しに引数が無いことで「リクエストのcookieを一切渡していない」ことを示す
    expect(createAnonClientMock).toHaveBeenCalledWith()
  })
})
