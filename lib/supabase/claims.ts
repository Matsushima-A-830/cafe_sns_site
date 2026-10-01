export type AuthClaims = {
  role: 'user' | 'owner' | 'admin' | null
  status: 'active' | 'pending_consent' | 'suspended' | 'deleted' | null
  onboarded: boolean
}

/**
 * custom_access_token_hook が JWT の app_metadata に差し込んだ role/status/onboarded を読む。
 * user.app_metadata (auth.users.raw_app_meta_data) はフックの出力を反映しないため、
 * JWT ペイロードを直接デコードする必要がある。呼び出し元が署名検証済みの
 * access_token（session.access_token）を渡す前提
 */
export function decodeAppMetadataClaims(accessToken: string): AuthClaims {
  const fallback: AuthClaims = { role: null, status: null, onboarded: false }
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return fallback
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const meta = decoded.app_metadata ?? {}
    return {
      role: meta.role ?? null,
      status: meta.status ?? null,
      onboarded: Boolean(meta.onboarded),
    }
  } catch {
    return fallback
  }
}
