'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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

// TODO: 保護者への実際の同意メール送信は未実装 (pending-items B3 が未決のため)。
// guardian_email を保持して pending_consent 状態に入るところまでを実装し、
// 同意リンク/ワンタイムトークンの検証は B3 決定後に追加する
export async function submitGuardianConsent(input: unknown): Promise<Result<null>> {
  const parsed = guardianConsentSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await updateSignupMetadata(user.id, {
    guardian_email: parsed.data.guardianEmail,
  })
  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  return { ok: true, data: null }
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
