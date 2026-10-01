import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { generateGuardianConsentToken } from './guardian-consent-token'

describe('generateGuardianConsentToken', () => {
  it('URLセーフな十分長いランダムトークンを生成する', () => {
    const { token } = generateGuardianConsentToken()

    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('呼ぶたびに異なるトークンを生成する', () => {
    const a = generateGuardianConsentToken()
    const b = generateGuardianConsentToken()

    expect(a.token).not.toBe(b.token)
  })

  it('tokenHash は token の SHA-256(hex) で、生のtokenと一致しない（approve_guardian_consent RPCと同じ計算式）', () => {
    const { token, tokenHash } = generateGuardianConsentToken()

    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(tokenHash).not.toBe(token)
  })

  it('有効期限は未来のISO日時', () => {
    const before = Date.now()
    const { expiresAt } = generateGuardianConsentToken()

    expect(new Date(expiresAt).getTime()).toBeGreaterThan(before)
  })
})
