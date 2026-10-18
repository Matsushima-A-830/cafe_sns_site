import { NextRequest, NextResponse } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { middleware } from './middleware'

const { updateSessionMock } = vi.hoisted(() => ({ updateSessionMock: vi.fn() }))
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: updateSessionMock }))

type Claims = { role: 'user' | 'owner' | 'admin' | null; status: string | null; onboarded: boolean }

function mockSession(user: { id: string } | null, claims: Claims | null) {
  updateSessionMock.mockResolvedValue({
    response: NextResponse.next(),
    user,
    claims,
  })
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`)
}

const authedUser = { id: 'user-1' }

afterEach(() => {
  vi.clearAllMocks()
})

// D73: サインアップ完了済み（profiles行あり）は status の値を問わず /signup/* を閉じる
describe('middleware: /signup /login への既ログインアクセス', () => {
  it('status が pending_consent（未成年の同意待ち）でも /signup/birthdate は /account/pending へ差し戻す', async () => {
    mockSession(authedUser, { role: 'user', status: 'pending_consent', onboarded: false })

    const res = await middleware(request('/signup/birthdate'))

    expect(res.headers.get('location')).toBe('http://localhost/account/pending')
  })

  it('status が active かつ未オンボーディングなら /onboarding/profile へ差し戻す', async () => {
    mockSession(authedUser, { role: 'user', status: 'active', onboarded: false })

    const res = await middleware(request('/signup/birthdate'))

    expect(res.headers.get('location')).toBe('http://localhost/onboarding/profile')
  })

  it('status が active かつオンボーディング完了済みなら /me へ差し戻す', async () => {
    mockSession(authedUser, { role: 'user', status: 'active', onboarded: true })

    const res = await middleware(request('/login'))

    expect(res.headers.get('location')).toBe('http://localhost/me')
  })

  it('status が null（profiles行がまだ無い、OTP確認後〜プロフィール作成前）なら /signup/birthdate を通す', async () => {
    mockSession(authedUser, { role: 'user', status: null, onboarded: false })

    const res = await middleware(request('/signup/birthdate'))

    expect(res.headers.get('location')).toBeNull()
  })

  it('未ログインなら /signup/birthdate を通す', async () => {
    mockSession(null, null)

    const res = await middleware(request('/signup/birthdate'))

    expect(res.headers.get('location')).toBeNull()
  })
})
