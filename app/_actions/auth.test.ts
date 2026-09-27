import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  refreshConsentStatus,
  resendGuardianConsentEmail,
  submitGuardianConsent,
  updateGuardianEmail,
} from './auth'

const {
  createClientMock,
  createAdminClientMock,
  sendGuardianConsentEmailMock,
  generateGuardianConsentTokenMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  sendGuardianConsentEmailMock: vi.fn(),
  generateGuardianConsentTokenMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: createAdminClientMock }))
vi.mock('@/lib/email/guardian-consent', () => ({
  sendGuardianConsentEmail: sendGuardianConsentEmailMock,
}))
vi.mock('@/lib/utils/guardian-consent-token', () => ({
  generateGuardianConsentToken: generateGuardianConsentTokenMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const TOKEN = {
  token: 'fixed-token',
  tokenHash: 'fixed-token-hash',
  expiresAt: '2099-01-01T00:00:00.000Z',
}

function buildAuthGetUser(user: { id: string } | null = { id: userId }) {
  return { getUser: vi.fn().mockResolvedValue({ data: { user } }) }
}

afterEach(() => {
  vi.clearAllMocks()
  generateGuardianConsentTokenMock.mockReturnValue(TOKEN)
  sendGuardianConsentEmailMock.mockResolvedValue({ ok: true })
})

describe('submitGuardianConsent', () => {
  it('不正な入力は INVALID_INPUT を返す', async () => {
    const result = await submitGuardianConsent({ guardianEmail: 'not-an-email', agreed: true })
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインは UNAUTHENTICATED を返す', async () => {
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(null) })

    const result = await submitGuardianConsent({
      guardianEmail: 'guardian@example.com',
      agreed: true,
    })
    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('トークンを生成しapp_metadataへ保存してメールを送る', async () => {
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser() })
    const updateUserById = vi.fn().mockResolvedValue({ error: null })
    createAdminClientMock.mockReturnValue({ auth: { admin: { updateUserById } } })

    const result = await submitGuardianConsent({
      guardianEmail: 'guardian@example.com',
      agreed: true,
    })

    expect(result).toEqual({ ok: true, data: null })
    expect(updateUserById).toHaveBeenCalledWith(userId, {
      app_metadata: {
        guardian_email: 'guardian@example.com',
        guardian_consent_token_hash: TOKEN.tokenHash,
        guardian_consent_token_expires_at: TOKEN.expiresAt,
      },
    })
    expect(sendGuardianConsentEmailMock).toHaveBeenCalledWith({
      guardianEmail: 'guardian@example.com',
      token: TOKEN.token,
    })
  })

  it('メール送信が失敗したら EXTERNAL_SERVICE_ERROR を返す', async () => {
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser() })
    createAdminClientMock.mockReturnValue({
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: null }) } },
    })
    sendGuardianConsentEmailMock.mockResolvedValue({ ok: false, error: 'boom' })

    const result = await submitGuardianConsent({
      guardianEmail: 'guardian@example.com',
      agreed: true,
    })

    expect(result).toEqual({ ok: false, error: 'EXTERNAL_SERVICE_ERROR', details: 'boom' })
  })
})

describe('resendGuardianConsentEmail', () => {
  it('未ログインは UNAUTHENTICATED を返す', async () => {
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(null) })

    const result = await resendGuardianConsentEmail()
    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('status が pending_consent でなければ CONFLICT を返す', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { guardian_email: 'g@example.com', status: 'active' },
      error: null,
    })
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) }))
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await resendGuardianConsentEmail()
    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('送信〜保存の間に承認済みになっていた場合はCONFLICTを返す（保存は上書きしない）', async () => {
    const selectMaybeSingle = vi.fn().mockResolvedValue({
      data: { guardian_email: 'g@example.com', status: 'pending_consent' },
      error: null,
    })
    // 送信は成功するが、保存直前に承認されていたと想定し update は0件ヒット
    const updateMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: selectMaybeSingle })) })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: updateMaybeSingle })) })),
        })),
      })),
    }))
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await resendGuardianConsentEmail()

    expect(sendGuardianConsentEmailMock).toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('新しいトークンを発行して再送する', async () => {
    const selectMaybeSingle = vi.fn().mockResolvedValue({
      data: { guardian_email: 'g@example.com', status: 'pending_consent' },
      error: null,
    })
    const updateMaybeSingle = vi.fn().mockResolvedValue({ data: { id: userId }, error: null })
    const updateEqStatus = vi.fn(() => ({
      select: vi.fn(() => ({ maybeSingle: updateMaybeSingle })),
    }))
    const updateEqId = vi.fn(() => ({ eq: updateEqStatus }))
    const update = vi.fn(() => ({ eq: updateEqId }))
    const from = vi.fn((table: string) => {
      if (table !== 'profiles') throw new Error(`unexpected table: ${table}`)
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: selectMaybeSingle })) })),
        update,
      }
    })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await resendGuardianConsentEmail()

    expect(result).toEqual({ ok: true, data: null })
    expect(update).toHaveBeenCalledWith({
      guardian_consent_token_hash: TOKEN.tokenHash,
      guardian_consent_token_expires_at: TOKEN.expiresAt,
    })
    expect(updateEqId).toHaveBeenCalledWith('id', userId)
    expect(updateEqStatus).toHaveBeenCalledWith('status', 'pending_consent')
    expect(sendGuardianConsentEmailMock).toHaveBeenCalledWith({
      guardianEmail: 'g@example.com',
      token: TOKEN.token,
    })
  })
})

describe('updateGuardianEmail', () => {
  it('不正な入力は INVALID_INPUT を返す', async () => {
    const result = await updateGuardianEmail('not-an-email')
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
  })

  it('status が pending_consent でなければ CONFLICT を返す（送信もしない）', async () => {
    const selectMaybeSingle = vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null })
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: selectMaybeSingle })) })),
    }))
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await updateGuardianEmail('new@example.com')
    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
    expect(sendGuardianConsentEmailMock).not.toHaveBeenCalled()
  })

  it('送信〜保存の間に承認済みになっていた場合はCONFLICTを返す（保存は上書きしない）', async () => {
    const selectMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { status: 'pending_consent' }, error: null })
    const updateMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: selectMaybeSingle })) })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: updateMaybeSingle })) })),
        })),
      })),
    }))
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await updateGuardianEmail('new@example.com')

    expect(sendGuardianConsentEmailMock).toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('保護者メールを更新しトークンを再発行して送信する', async () => {
    const selectMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { status: 'pending_consent' }, error: null })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: userId }, error: null })
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) })) })),
    }))
    const from = vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: selectMaybeSingle })) })),
      update,
    }))
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await updateGuardianEmail('new@example.com')

    expect(result).toEqual({ ok: true, data: null })
    expect(update).toHaveBeenCalledWith({
      guardian_email: 'new@example.com',
      guardian_consent_token_hash: TOKEN.tokenHash,
      guardian_consent_token_expires_at: TOKEN.expiresAt,
    })
    expect(sendGuardianConsentEmailMock).toHaveBeenCalledWith({
      guardianEmail: 'new@example.com',
      token: TOKEN.token,
    })
  })
})

describe('refreshConsentStatus', () => {
  it('未ログインは UNAUTHENTICATED を返す', async () => {
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(null) })

    const result = await refreshConsentStatus()
    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('refreshSession してから最新の status を返す', async () => {
    const refreshSession = vi.fn().mockResolvedValue({})
    const maybeSingle = vi.fn().mockResolvedValue({ data: { status: 'active' }, error: null })
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) }))
    createClientMock.mockResolvedValue({
      auth: { ...buildAuthGetUser(), refreshSession },
      from,
    })

    const result = await refreshConsentStatus()

    expect(refreshSession).toHaveBeenCalled()
    expect(result).toEqual({ ok: true, data: { status: 'active' } })
  })
})
