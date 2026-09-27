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
  GUARDIAN_CONSENT_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  GUARDIAN_CONSENT_REISSUE_COOLDOWN_MS: 60 * 1000,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const TOKEN = {
  token: 'fixed-token',
  tokenHash: 'fixed-token-hash',
  expiresAt: '2099-01-01T00:00:00.000Z',
}

function buildAuthGetUser(
  user: { id: string; email?: string } | null = { id: userId, email: 'minor@example.com' },
) {
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

  it('保護者メールが本人のアカウントメールと同一なら GUARDIAN_EMAIL_SELF_FORBIDDEN を返す（自己承認防止）', async () => {
    createClientMock.mockResolvedValue({
      auth: buildAuthGetUser({ id: userId, email: 'minor@example.com' }),
    })

    const result = await submitGuardianConsent({
      guardianEmail: 'Minor@Example.com',
      agreed: true,
    })

    expect(result).toEqual({ ok: false, error: 'GUARDIAN_EMAIL_SELF_FORBIDDEN' })
    expect(sendGuardianConsentEmailMock).not.toHaveBeenCalled()
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

// assertPendingConsent（regular client）用。guardian_consent_token_issued_at は
// クールダウン判定に使うため、テスト対象時刻より十分過去（クールダウン圏外）をデフォルトにする
function buildProfileSelectFrom(
  profile: {
    guardian_email?: string | null
    status: string | null
    guardian_consent_token_issued_at?: string | null
  } | null,
) {
  const resolved = profile ? { guardian_consent_token_issued_at: null, ...profile } : null
  const maybeSingle = vi.fn().mockResolvedValue({ data: resolved, error: null })
  return vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) }))
}

// reissueGuardianConsentToken は createAdminClient() 経由で2回UPDATEする
// （1回目: クールダウン予約、2回目: 実際のトークン保存）。同じチェーン形状
// （update→eq→eq→[or]→select→maybeSingle）で両方に対応する
function buildAdminUpdateFrom(
  claimResult: { data: { id: string } | null; error: unknown },
  finalResult?: { data: { id: string } | null; error: unknown },
) {
  let call = 0
  const results = [claimResult, finalResult ?? claimResult]
  const maybeSingle = vi.fn(() => Promise.resolve(results[call++]))
  const chain = {
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle,
  }
  const update = vi.fn(() => chain)
  return { from: vi.fn(() => ({ update })), update }
}

describe('resendGuardianConsentEmail', () => {
  it('未ログインは UNAUTHENTICATED を返す', async () => {
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(null) })

    const result = await resendGuardianConsentEmail()
    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('status が active なら CONFLICT を返す', async () => {
    const from = buildProfileSelectFrom({ guardian_email: 'g@example.com', status: 'active' })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await resendGuardianConsentEmail()
    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('status が suspended なら ACCOUNT_SUSPENDED を返す', async () => {
    const from = buildProfileSelectFrom({ status: 'suspended' })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await resendGuardianConsentEmail()
    expect(result).toEqual({ ok: false, error: 'ACCOUNT_SUSPENDED' })
  })

  it('status が deleted なら ACCOUNT_DELETED を返す', async () => {
    const from = buildProfileSelectFrom({ status: 'deleted' })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await resendGuardianConsentEmail()
    expect(result).toEqual({ ok: false, error: 'ACCOUNT_DELETED' })
  })

  it('直前にトークンを発行していた（クールダウン中）なら早期チェックでRATE_LIMITEDを返す', async () => {
    const from = buildProfileSelectFrom({
      guardian_email: 'g@example.com',
      status: 'pending_consent',
      // 30秒前に発行（クールダウン60秒以内）
      guardian_consent_token_issued_at: new Date(Date.now() - 30_000).toISOString(),
    })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await resendGuardianConsentEmail()
    expect(result).toEqual({ ok: false, error: 'RATE_LIMITED' })
    expect(sendGuardianConsentEmailMock).not.toHaveBeenCalled()
  })

  it('早期チェックを通過しても、原子的な予約UPDATEがクールダウンで弾かれたらRATE_LIMITEDを返し送信しない（TOCTOU対策）', async () => {
    const from = buildProfileSelectFrom({
      guardian_email: 'g@example.com',
      status: 'pending_consent',
    })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })
    // 予約UPDATEが0件（別リクエストが先にクールダウンを消費した）
    createAdminClientMock.mockReturnValue(buildAdminUpdateFrom({ data: null, error: null }))

    const result = await resendGuardianConsentEmail()

    expect(result).toEqual({ ok: false, error: 'RATE_LIMITED' })
    expect(sendGuardianConsentEmailMock).not.toHaveBeenCalled()
  })

  it('送信〜保存の間に承認済みになっていた場合はCONFLICTを返す（保存は上書きしない）', async () => {
    const from = buildProfileSelectFrom({
      guardian_email: 'g@example.com',
      status: 'pending_consent',
    })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })
    createAdminClientMock.mockReturnValue(
      buildAdminUpdateFrom({ data: { id: userId }, error: null }, { data: null, error: null }),
    )

    const result = await resendGuardianConsentEmail()

    expect(sendGuardianConsentEmailMock).toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('新しいトークンを発行して再送する（クールダウン予約→送信→保存の順でadminクライアント経由）', async () => {
    const from = buildProfileSelectFrom({
      guardian_email: 'g@example.com',
      status: 'pending_consent',
    })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })
    const admin = buildAdminUpdateFrom({ data: { id: userId }, error: null })
    createAdminClientMock.mockReturnValue(admin)

    const result = await resendGuardianConsentEmail()

    expect(result).toEqual({ ok: true, data: null })
    expect(admin.update).toHaveBeenNthCalledWith(1, {
      guardian_consent_token_issued_at: expect.any(String),
    })
    expect(admin.update).toHaveBeenNthCalledWith(2, {
      guardian_consent_token_hash: TOKEN.tokenHash,
      guardian_consent_token_expires_at: TOKEN.expiresAt,
    })
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
    const from = buildProfileSelectFrom({ status: 'active' })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })

    const result = await updateGuardianEmail('new@example.com')
    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
    expect(sendGuardianConsentEmailMock).not.toHaveBeenCalled()
  })

  it('変更後の保護者メールが本人のアカウントメールと同一なら GUARDIAN_EMAIL_SELF_FORBIDDEN を返す（自己承認防止）', async () => {
    createClientMock.mockResolvedValue({
      auth: buildAuthGetUser({ id: userId, email: 'minor@example.com' }),
    })

    const result = await updateGuardianEmail('minor@example.com')

    expect(result).toEqual({ ok: false, error: 'GUARDIAN_EMAIL_SELF_FORBIDDEN' })
    expect(sendGuardianConsentEmailMock).not.toHaveBeenCalled()
  })

  it('送信〜保存の間に承認済みになっていた場合はCONFLICTを返す（保存は上書きしない）', async () => {
    const from = buildProfileSelectFrom({ status: 'pending_consent' })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })
    createAdminClientMock.mockReturnValue(
      buildAdminUpdateFrom({ data: { id: userId }, error: null }, { data: null, error: null }),
    )

    const result = await updateGuardianEmail('new@example.com')

    expect(sendGuardianConsentEmailMock).toHaveBeenCalled()
    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
  })

  it('保護者メールを更新しトークンを再発行して送信する（保存はadminクライアント経由）', async () => {
    const from = buildProfileSelectFrom({ status: 'pending_consent' })
    createClientMock.mockResolvedValue({ auth: buildAuthGetUser(), from })
    const admin = buildAdminUpdateFrom({ data: { id: userId }, error: null })
    createAdminClientMock.mockReturnValue(admin)

    const result = await updateGuardianEmail('new@example.com')

    expect(result).toEqual({ ok: true, data: null })
    expect(admin.update).toHaveBeenNthCalledWith(2, {
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

  it('refreshSession が失敗したら INTERNAL_ERROR を返し、DBを読みに行かない（JWTが古いまま最新扱いされるのを防ぐ）', async () => {
    const refreshSession = vi.fn().mockResolvedValue({ error: { message: 'refresh failed' } })
    const from = vi.fn()
    createClientMock.mockResolvedValue({
      auth: { ...buildAuthGetUser(), refreshSession },
      from,
    })

    const result = await refreshConsentStatus()

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR', details: 'refresh failed' })
    expect(from).not.toHaveBeenCalled()
  })
})
