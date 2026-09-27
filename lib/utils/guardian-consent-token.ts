import { createHash, randomBytes } from 'node:crypto'

// 有効期限7日。保護者がメールを確認するまでの猶予として十分な長さを取る
export const GUARDIAN_CONSENT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * anon から呼べる SECURITY DEFINER RPC（approve_guardian_consent）の
 * 唯一の防御線になるトークン。総当たりを非現実的にするため32byte（256bit）の乱数を使う。
 *
 * 生の token はメールにのみ載せ、DB（profiles.guardian_consent_token_hash）には
 * SHA-256ハッシュだけを保存する。profiles の SELECT RLS が `using(true)` で
 * 列も絞れないため、生の値を保存すると anon の直接PostgREST呼び出しで
 * 盗み見られメールを介さず同意を偽装できてしまう
 *   supabase/migrations/20260927010000_add_guardian_consent_token.sql
 */
export function generateGuardianConsentToken(): {
  token: string
  tokenHash: string
  expiresAt: string
} {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: hashGuardianConsentToken(token),
    expiresAt: new Date(Date.now() + GUARDIAN_CONSENT_TOKEN_TTL_MS).toISOString(),
  }
}

// approve_guardian_consent RPC（Postgres側）と同じ sha256/hex で計算する。アルゴリズムを
// 変える場合は両方を同時に変更しないと既発行トークンが全滅する
function hashGuardianConsentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
