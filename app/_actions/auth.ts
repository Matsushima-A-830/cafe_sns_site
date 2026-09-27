'use server'

import { redirect } from 'next/navigation'
import { sendGuardianConsentEmail } from '@/lib/email/guardian-consent'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { generateGuardianConsentToken } from '@/lib/utils/guardian-consent-token'
import {
  birthdateSchema,
  emailSchema,
  guardianConsentSchema,
  loginSchema,
  otpSchema,
  signupSchema,
} from '@/lib/validators/auth'
import type { Result } from '@/types/result'

/**
 * 生年月日は signup の時点では profiles にまだ書けない
 * （username / display_name が onboarding/profile まで確定しないため、NOT NULL 制約を満たせない）。
 * confirm 後、一時的にどこかへ保持して onboarding/profile の profiles INSERT 時に読み出す。
 *
 * user_metadata (raw_user_meta_data) には保存しない — authenticated な本人が
 * supabase.auth.updateUser() で自由に書き換えられるため、age_category を
 * 'adult' に自己申告して保護者同意フローを丸ごとスキップできてしまう。
 * app_metadata (raw_app_meta_data) は Admin API 経由でしか書けないため、こちらを使う
 */
type SignupMetadata = {
  birth_date?: string
  age_category?: 'minor' | 'adult'
  guardian_email?: string
  guardian_consent_token_hash?: string
  guardian_consent_token_expires_at?: string
}

async function updateSignupMetadata(userId: string, metadata: SignupMetadata) {
  const admin = createAdminClient()
  return admin.auth.admin.updateUserById(userId, { app_metadata: metadata })
}

export async function signUp(input: unknown): Promise<Result<{ email: string }>> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    if (error.code === 'user_already_exists') return { ok: false, error: 'EMAIL_ALREADY_EXISTS' }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  return { ok: true, data: { email: parsed.data.email } }
}

export async function verifySignupOtp(input: unknown): Promise<Result<null>> {
  const parsed = otpSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'signup',
  })

  if (error) {
    if (error.code === 'otp_expired') return { ok: false, error: 'OTP_EXPIRED' }
    return { ok: false, error: 'OTP_INVALID' }
  }

  return { ok: true, data: null }
}

export async function resendSignupOtp(input: unknown): Promise<Result<null>> {
  // Server Actions は事実上公開エンドポイント。バリデーション無しの生文字列だと
  // 任意アドレスへメール送信を仕掛けるトリガーになる
  const parsed = emailSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email: parsed.data })
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: null }
}

export async function submitBirthdate(
  input: unknown,
): Promise<Result<{ ageCategory: 'blocked' | 'minor' | 'adult' }>> {
  const parsed = birthdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const { birthDate, ageCategory } = parsed.data
  if (ageCategory === 'blocked') return { ok: false, error: 'AGE_RESTRICTED' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await updateSignupMetadata(user.id, {
    birth_date: birthDate.toISOString().slice(0, 10),
    age_category: ageCategory,
  })
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  return { ok: true, data: { ageCategory } }
}

/**
 * profiles 行がまだ無い時点（onboarding/profile より前）なので、トークンも
 * guardian_email と同じく app_metadata に一時保持する。submitProfile が
 * profiles 行を作る際にまとめて写す（pending-items B3）。
 *
 * app_metadata は本人が supabase.auth.getUser() で読める（GoTrueは本人の全項目を返す）。
 * 生トークンをそのまま置くと本人がそれを取り出して /api/consent/confirm を自分で叩き、
 * 保護者同意を自己承認できてしまう。ハッシュだけを保持し、生の値はメールにしか存在させない
 */
export async function submitGuardianConsent(input: unknown): Promise<Result<null>> {
  const parsed = guardianConsentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { token, tokenHash, expiresAt } = generateGuardianConsentToken()

  const { error } = await updateSignupMetadata(user.id, {
    guardian_email: parsed.data.guardianEmail,
    guardian_consent_token_hash: tokenHash,
    guardian_consent_token_expires_at: expiresAt,
  })
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  const sent = await sendGuardianConsentEmail({ guardianEmail: parsed.data.guardianEmail, token })
  if (!sent.ok) return { ok: false, error: 'EXTERNAL_SERVICE_ERROR', details: sent.error }

  return { ok: true, data: null }
}

/**
 * S_ACCOUNT_PENDING「再送する」。この時点では profiles 行が既にあるので
 * （onboarding/profile 済み）、app_metadata ではなく profiles を直接更新する。
 * guardian_email / トークン列は guard_privileged_profile_columns の対象外なので
 * 本人の通常の RLS UPDATE（auth.uid() = id）で書ける
 */
export async function resendGuardianConsentEmail(): Promise<Result<null>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('guardian_email, status')
    .eq('id', user.id)
    .maybeSingle()
  if (fetchError) return { ok: false, error: 'INTERNAL_ERROR', details: fetchError.message }
  if (profile?.status !== 'pending_consent') return { ok: false, error: 'CONFLICT' }
  if (!profile.guardian_email) return { ok: false, error: 'CONSENT_REQUIRED' }

  const { token, tokenHash, expiresAt } = generateGuardianConsentToken()
  const { error } = await supabase
    .from('profiles')
    .update({
      guardian_consent_token_hash: tokenHash,
      guardian_consent_token_expires_at: expiresAt,
    })
    .eq('id', user.id)
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  const sent = await sendGuardianConsentEmail({ guardianEmail: profile.guardian_email, token })
  if (!sent.ok) return { ok: false, error: 'EXTERNAL_SERVICE_ERROR', details: sent.error }

  return { ok: true, data: null }
}

// S_ACCOUNT_PENDING「メールアドレスを変更」。宛先を直すのと同時にトークンも再発行して送り直す
export async function updateGuardianEmail(input: unknown): Promise<Result<null>> {
  const parsed = emailSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { token, tokenHash, expiresAt } = generateGuardianConsentToken()
  const { data: updated, error } = await supabase
    .from('profiles')
    .update({
      guardian_email: parsed.data,
      guardian_consent_token_hash: tokenHash,
      guardian_consent_token_expires_at: expiresAt,
    })
    .eq('id', user.id)
    .eq('status', 'pending_consent')
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  if (!updated) return { ok: false, error: 'CONFLICT' }

  const sent = await sendGuardianConsentEmail({ guardianEmail: parsed.data, token })
  if (!sent.ok) return { ok: false, error: 'EXTERNAL_SERVICE_ERROR', details: sent.error }

  return { ok: true, data: null }
}

/**
 * S_ACCOUNT_PENDING「状態を確認する」。保護者の同意クリックは別デバイス・別セッションで
 * 起きるため、本人のJWTには反映されない。refreshSession() で明示的に取り直す
 *   docs/product/pending-items.md B3
 */
export async function refreshConsentStatus(): Promise<Result<{ status: string | null }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  await supabase.auth.refreshSession()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  return { ok: true, data: { status: profile?.status ?? null } }
}

export async function logIn(input: unknown): Promise<Result<null>> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { ok: false, error: 'INVALID_CREDENTIALS' }

  return { ok: true, data: null }
}

export async function logOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
