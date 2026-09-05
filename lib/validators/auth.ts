import { z } from 'zod'
import { calculateAgeCategory } from './age'

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('メールアドレスの形式が正しくありません')

// 8文字以上・英数字混合（ワイヤーフレーム S_SIGNUP の注記に準拠）
export const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上で入力してください')
  .regex(/[A-Za-z]/, 'パスワードは英字を含めてください')
  .regex(/[0-9]/, 'パスワードは数字を含めてください')

export const signupSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    agreedToTerms: z.literal(true, '利用規約とプライバシーポリシーへの同意が必要です'),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'パスワードが一致しません',
    path: ['passwordConfirm'],
  })

export type SignupInput = z.infer<typeof signupSchema>

export const otpSchema = z.object({
  email: emailSchema,
  token: z.string().regex(/^\d{6}$/, '6桁の確認コードを入力してください'),
})

export type OtpInput = z.infer<typeof otpSchema>

export const birthdateSchema = z
  .object({
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
    day: z.coerce.number().int().min(1).max(31),
  })
  .refine(
    ({ year, month, day }) => {
      const date = new Date(Date.UTC(year, month - 1, day))
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      )
    },
    { message: '存在しない日付です', path: ['day'] },
  )
  .transform(({ year, month, day }) => {
    const birthDate = new Date(Date.UTC(year, month - 1, day))
    return { birthDate, ageCategory: calculateAgeCategory(birthDate) }
  })

export type BirthdateInput = z.output<typeof birthdateSchema>

export const guardianConsentSchema = z.object({
  guardianEmail: emailSchema,
  agreed: z.literal(true, '保護者から同意を得ることの確認が必要です'),
})

export type GuardianConsentInput = z.infer<typeof guardianConsentSchema>

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'パスワードを入力してください'),
})

export type LoginInput = z.infer<typeof loginSchema>
