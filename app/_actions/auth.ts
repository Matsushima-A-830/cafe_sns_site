'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  birthdateSchema,
  guardianConsentSchema,
  loginSchema,
  otpSchema,
  signupSchema,
} from '@/lib/validators/auth'
import type { Result } from '@/types/result'

/**
 * 生年月日は signup の時点では profiles にまだ書けない
 * （username / display_name が onboarding/profile まで確定しないため、NOT NULL 制約を満たせない）。
 * confirm 後の auth.users.user_metadata に一時保持し、onboarding/profile の profiles INSERT 時に読み出す
 */
type SignupMetadata = {
  birth_date?: string
  age_category?: 'minor' | 'adult'
  guardian_email?: string
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

export async function resendSignupOtp(email: string): Promise<Result<null>> {
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
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
  const metadata: SignupMetadata = {
    birth_date: birthDate.toISOString().slice(0, 10),
    age_category: ageCategory,
  }
  const { error } = await supabase.auth.updateUser({ data: metadata })
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
  const metadata: SignupMetadata = { guardian_email: parsed.data.guardianEmail }
  const { error } = await supabase.auth.updateUser({ data: metadata })
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
