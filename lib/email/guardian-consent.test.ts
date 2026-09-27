import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendGuardianConsentEmail } from './guardian-consent'

vi.mock('server-only', () => ({}))

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }))

vi.mock('./resend', () => ({ sendEmail: sendEmailMock }))
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_SITE_URL: 'https://example.com' } }))

afterEach(() => {
  vi.clearAllMocks()
})

describe('sendGuardianConsentEmail', () => {
  it('confirm URLにトークンを埋め込んで送信する', async () => {
    sendEmailMock.mockResolvedValue({ ok: true })

    const result = await sendGuardianConsentEmail({
      guardianEmail: 'guardian@example.com',
      token: 'abc123',
    })

    expect(result).toEqual({ ok: true })
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'guardian@example.com',
        html: expect.stringContaining('https://example.com/api/consent/confirm?token=abc123'),
      }),
    )
  })

  it('sendEmail の失敗をそのまま返す', async () => {
    sendEmailMock.mockResolvedValue({ ok: false, error: '失敗' })

    const result = await sendGuardianConsentEmail({
      guardianEmail: 'guardian@example.com',
      token: 'abc123',
    })

    expect(result).toEqual({ ok: false, error: '失敗' })
  })
})
