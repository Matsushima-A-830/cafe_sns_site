/**
 * profiles 行がまだ無い時点（onboarding/profile より前）の下書き項目。
 * auth.users の app_metadata に一時保持する（app/_actions/auth.ts）。
 * onboarding/profile の profiles INSERT 時にここから読み出して写す（app/_actions/onboarding.ts）
 */
export type SignupMetadata = {
  birth_date?: string
  age_category?: 'minor' | 'adult'
  guardian_email?: string
  guardian_consent_token_hash?: string
  guardian_consent_token_expires_at?: string
}
