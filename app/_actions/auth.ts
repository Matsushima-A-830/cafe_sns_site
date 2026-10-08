'use server'

import { redirect } from 'next/navigation'
import { isBetaSignupClosed } from '@/lib/constants/beta'
import { sendGuardianConsentEmail } from '@/lib/email/guardian-consent'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  GUARDIAN_CONSENT_REISSUE_COOLDOWN_MS,
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

// 保護者メールが未成年本人のアカウントメールと同一だと、本人が自分宛にリンクを送って自己承認できる
function isGuardianEmailSelf(guardianEmail: string, ownEmail: string | undefined) {
  return !!ownEmail && guardianEmail.trim().toLowerCase() === ownEmail.trim().toLowerCase()
}

export async function signUp(input: unknown): Promise<Result<{ email: string }>> {
  // /signup ページ側の表示切替だけだとServer Actionを直接叩かれた場合に抜ける（D67）
  if (isBetaSignupClosed()) return { ok: false, error: 'BETA_SIGNUP_CLOSED' }

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
 * profiles 行がまだ無いため、トークンも guardian_email 同様 app_metadata に一時保持する
 * （submitProfile が profiles 行作成時に写す。pending-items B3）。
 * - app_metadata は本人が supabase.auth.getUser() で読めるため、生トークンではなくハッシュを保持する
 *   （生の値を置くと本人が自己承認できてしまう）
 */
export async function submitGuardianConsent(input: unknown): Promise<Result<null>> {
  const parsed = guardianConsentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }
  if (isGuardianEmailSelf(parsed.data.guardianEmail, user.email)) {
    return { ok: false, error: 'GUARDIAN_EMAIL_SELF_FORBIDDEN' }
  }

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
}

/**
 * 「pending_consentの本人か」の共通ガード（「再送する」「メールアドレスを変更」で使う）。
 * - suspended/deleted は CONFLICT ではなく専用コードを返す
 * - クールダウンの最終的な判定は reissueGuardianConsentToken の原子的UPDATEで行う。
 *   ここでの判定はUXのための早期リターンに過ぎず、TOCTOUで通り抜けても実害はない
 */
async function assertPendingConsent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Result<PendingConsentProfile>> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('guardian_email, status, guardian_consent_token_issued_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  if (profile?.status === 'suspended') return { ok: false, error: 'ACCOUNT_SUSPENDED' }
  if (profile?.status === 'deleted') return { ok: false, error: 'ACCOUNT_DELETED' }
  if (profile?.status !== 'pending_consent') return { ok: false, error: 'CONFLICT' }

  if (profile.guardian_consent_token_issued_at) {
    const issuedAt = new Date(profile.guardian_consent_token_issued_at).getTime()
    if (Date.now() - issuedAt < GUARDIAN_CONSENT_REISSUE_COOLDOWN_MS) {
      return { ok: false, error: 'RATE_LIMITED' }
    }
  }

  return { ok: true, data: { guardian_email: profile.guardian_email } }
}

/**
 * guardian_email 宛にトークンを再発行して送る共通処理（「再送する」「メールアドレスを変更」で使う）。
 * - 書き込みは createAdminClient() 経由に限定する。本人セッションで書けると
 *   guard_privileged_profile_columns の前提が崩れ自己承認できてしまう（/code-review で発覚）
 * - クールダウンの「予約」を送信前に原子的UPDATEで確保してから送る。assertPendingConsentの
 *   事前チェックだけだと、ほぼ同時に2回リクエストすると両方が通過して保護者に2通届きうる
 *   （TOCTOU。/code-review で発覚）。予約はguardian_consent_token_issued_atだけを更新し、
 *   既存の有効なトークン（hash/expires_at）には触れない
 * - 送信成功を確認してから最終保存する（先に保存すると送信失敗時に旧トークンごと失う）。
 *   送信が失敗しても予約は戻さない——クールダウンが再送信の乱発を防ぐ主目的のため、
 *   「送信失敗時は次のクールダウンまで待たせる」を許容するトレードオフ
 * - 最終保存も `status='pending_consent'` 条件付き（予約〜保存の間に承認済みになる競合を防ぐ）
 */
async function reissueGuardianConsentToken(
  userId: string,
  guardianEmail: string,
  extraUpdate: { guardian_email?: string } = {},
): Promise<Result<null>> {
  const admin = createAdminClient()
  const cooldownThreshold = new Date(
    Date.now() - GUARDIAN_CONSENT_REISSUE_COOLDOWN_MS,
  ).toISOString()
  const nowIso = new Date().toISOString()

  const { data: claimed, error: claimError } = await admin
    .from('profiles')
    .update({ guardian_consent_token_issued_at: nowIso })
    .eq('id', userId)
    .eq('status', 'pending_consent')
    .or(
      `guardian_consent_token_issued_at.is.null,guardian_consent_token_issued_at.lte.${cooldownThreshold}`,
    )
    .select('id')
    .maybeSingle()
  if (claimError) return { ok: false, error: 'INTERNAL_ERROR', details: claimError.message }
  if (!claimed) return { ok: false, error: 'RATE_LIMITED' }

  const { token, tokenHash, expiresAt } = generateGuardianConsentToken()

  const sent = await sendGuardianConsentEmail({ guardianEmail, token })
  if (!sent.ok) return { ok: false, error: 'EXTERNAL_SERVICE_ERROR', details: sent.error }

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
  if (isGuardianEmailSelf(parsed.data, user.email)) {
    return { ok: false, error: 'GUARDIAN_EMAIL_SELF_FORBIDDEN' }
  }

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

  // 失敗を握りつぶすと、JWTが古いままなのにDB読み取りだけ最新状態を返し、
  // 呼び出し元が誤って遷移してしまう（refreshできていないのでmiddlewareは古い状態のまま判定する）
  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) return { ok: false, error: 'INTERNAL_ERROR', details: refreshError.message }

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
