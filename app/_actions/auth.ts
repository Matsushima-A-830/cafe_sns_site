'use server'

import { redirect } from 'next/navigation'
import { sendGuardianConsentEmail } from '@/lib/email/guardian-consent'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  GUARDIAN_CONSENT_REISSUE_COOLDOWN_MS,
  GUARDIAN_CONSENT_TOKEN_TTL_MS,
  generateGuardianConsentToken,
} from '@/lib/utils/guardian-consent-token'
import {
  birthdateSchema,
  emailSchema,
  guardianConsentSchema,
  loginSchema,
  otpSchema,
  signupSchema,
} from '@/lib/validators/auth'
import type { Result } from '@/types/result'
import type { SignupMetadata } from '@/types/signup'

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

  // 送信成功を確認してから保存する。先に保存すると、送信失敗時に
  // 「誰にも届いていないトークン」だけがapp_metadataに残る
  const sent = await sendGuardianConsentEmail({ guardianEmail: parsed.data.guardianEmail, token })
  if (!sent.ok) return { ok: false, error: 'EXTERNAL_SERVICE_ERROR', details: sent.error }

  const { error } = await updateSignupMetadata(user.id, {
    guardian_email: parsed.data.guardianEmail,
    guardian_consent_token_hash: tokenHash,
    guardian_consent_token_expires_at: expiresAt,
  })
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  return { ok: true, data: null }
}

type PendingConsentProfile = {
  guardian_email: string | null
  guardian_consent_token_expires_at: string | null
}

/**
 * 「pending_consentの本人か」の共通ガード（S_ACCOUNT_PENDING の「再送する」「メールアドレスを変更」で使う）。
 * suspended/deleted は CONFLICT ではなく専用コードを返し、UIで意味の通るメッセージにする。
 *
 * 既存の guardian_consent_token_expires_at から発行時刻を逆算してクールダウンも見る
 * （expiresAt - TTL = 発行時刻）。専用のレート制限テーブルを作らずに連打送信を防ぐ
 */
async function assertPendingConsent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Result<PendingConsentProfile>> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('guardian_email, status, guardian_consent_token_expires_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  if (profile?.status === 'suspended') return { ok: false, error: 'ACCOUNT_SUSPENDED' }
  if (profile?.status === 'deleted') return { ok: false, error: 'ACCOUNT_DELETED' }
  if (profile?.status !== 'pending_consent') return { ok: false, error: 'CONFLICT' }

  if (profile.guardian_consent_token_expires_at) {
    const issuedAt =
      new Date(profile.guardian_consent_token_expires_at).getTime() - GUARDIAN_CONSENT_TOKEN_TTL_MS
    if (Date.now() - issuedAt < GUARDIAN_CONSENT_REISSUE_COOLDOWN_MS) {
      return { ok: false, error: 'RATE_LIMITED' }
    }
  }

  return {
    ok: true,
    data: {
      guardian_email: profile.guardian_email,
      guardian_consent_token_expires_at: profile.guardian_consent_token_expires_at,
    },
  }
}

/**
 * guardian_email 宛にトークンを再発行して送る共通処理
 * （S_ACCOUNT_PENDING の「再送する」「メールアドレスを変更」の両方から使う）。
 *
 * トークン列の書き込みは createAdminClient()（service_role）で行う。本人の通常セッション
 * （auth.uid() = id）で書くと、guard_privileged_profile_columns トリガーが弾く前提が崩れ
 * 「本人が自分でトークンを捏造して自己承認する」経路が開いてしまう（/code-review で発覚）。
 * この列を書けるのはこの関数（実際にメール送信した場合のみ）だけに絞る
 *
 * 送信成功を確認してから保存し、かつ保存も `status='pending_consent'` を条件にする。
 * 先に保存すると送信失敗時に有効だった旧トークンまで消してしまう。また、事前の
 * status 確認と保存の間に保護者が旧トークンで承認（status→active）した場合、条件無しの
 * UPDATE だと active な行に新トークンを上書きしてしまう
 */
async function reissueGuardianConsentToken(
  userId: string,
  guardianEmail: string,
  extraUpdate: { guardian_email?: string } = {},
): Promise<Result<null>> {
  const { token, tokenHash, expiresAt } = generateGuardianConsentToken()

  const sent = await sendGuardianConsentEmail({ guardianEmail, token })
  if (!sent.ok) return { ok: false, error: 'EXTERNAL_SERVICE_ERROR', details: sent.error }

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('profiles')
    .update({
      ...extraUpdate,
      guardian_consent_token_hash: tokenHash,
      guardian_consent_token_expires_at: expiresAt,
    })
    .eq('id', userId)
    .eq('status', 'pending_consent')
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  // 送信〜保存の間に承認済みになっていた（レース）。送ったメールのリンクは
  // status不一致でRPCが弾くので実害はないが、状態としてはCONFLICT
  if (!updated) return { ok: false, error: 'CONFLICT' }

  return { ok: true, data: null }
}

// S_ACCOUNT_PENDING「再送する」
export async function resendGuardianConsentEmail(): Promise<Result<null>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const checked = await assertPendingConsent(supabase, user.id)
  if (!checked.ok) return checked
  if (!checked.data.guardian_email) return { ok: false, error: 'CONSENT_REQUIRED' }

  return reissueGuardianConsentToken(user.id, checked.data.guardian_email)
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

  const checked = await assertPendingConsent(supabase, user.id)
  if (!checked.ok) return checked

  return reissueGuardianConsentToken(user.id, parsed.data, { guardian_email: parsed.data })
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
