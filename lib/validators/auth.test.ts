import { describe, expect, it } from 'vitest'
import { birthdateSchema, loginSchema, otpSchema, signupSchema } from './auth'

describe('signupSchema', () => {
  const base = {
    email: 'test@example.com',
    password: 'password1',
    passwordConfirm: 'password1',
    agreedToTerms: true as const,
  }

  it('正しい入力を通す', () => {
    expect(signupSchema.safeParse(base).success).toBe(true)
  })

  it('パスワード不一致を弾く', () => {
    const result = signupSchema.safeParse({ ...base, passwordConfirm: 'different1' })
    expect(result.success).toBe(false)
  })

  it('英数字混合でないパスワードを弾く', () => {
    const result = signupSchema.safeParse({
      ...base,
      password: 'onlyletters',
      passwordConfirm: 'onlyletters',
    })
    expect(result.success).toBe(false)
  })

  it('規約未同意を弾く', () => {
    const result = signupSchema.safeParse({ ...base, agreedToTerms: false })
    expect(result.success).toBe(false)
  })
})

describe('otpSchema', () => {
  it('6桁の数字を通す', () => {
    expect(otpSchema.safeParse({ email: 'a@example.com', token: '123456' }).success).toBe(true)
  })

  it('5桁を弾く', () => {
    expect(otpSchema.safeParse({ email: 'a@example.com', token: '12345' }).success).toBe(false)
  })
})

describe('birthdateSchema', () => {
  it('存在しない日付を弾く', () => {
    expect(birthdateSchema.safeParse({ year: 2020, month: 2, day: 30 }).success).toBe(false)
  })

  it('adult/minor/blocked を出し分ける', () => {
    const now = new Date()
    const adultYear = now.getUTCFullYear() - 20
    const result = birthdateSchema.safeParse({ year: adultYear, month: 1, day: 1 })
    expect(result.success && result.data.ageCategory).toBe('adult')
  })
})

describe('loginSchema', () => {
  it('空パスワードを弾く', () => {
    expect(loginSchema.safeParse({ email: 'a@example.com', password: '' }).success).toBe(false)
  })
})
