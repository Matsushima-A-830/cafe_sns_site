import { describe, expect, it } from 'vitest'
import { interestsSchema, profileSchema, usernameSchema } from './onboarding'

describe('usernameSchema', () => {
  it('英数字とアンダースコアを通す', () => {
    expect(usernameSchema.safeParse('cafe_lover_01').success).toBe(true)
  })

  it('日本語を弾く', () => {
    expect(usernameSchema.safeParse('カフェ好き').success).toBe(false)
  })

  it('2文字以下を弾く', () => {
    expect(usernameSchema.safeParse('ab').success).toBe(false)
  })
})

describe('profileSchema', () => {
  it('bio と avatarUrl は省略可能', () => {
    const result = profileSchema.safeParse({ username: 'cafe_lover', displayName: 'カフェ好き' })
    expect(result.success).toBe(true)
  })
})

describe('interestsSchema', () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

  it('1個以上5個以下を通す', () => {
    expect(interestsSchema.safeParse({ tagIds: [uuid(1)] }).success).toBe(true)
    expect(interestsSchema.safeParse({ tagIds: [1, 2, 3, 4, 5].map(uuid) }).success).toBe(true)
  })

  it('0個を弾く', () => {
    expect(interestsSchema.safeParse({ tagIds: [] }).success).toBe(false)
  })

  it('6個以上を弾く', () => {
    expect(interestsSchema.safeParse({ tagIds: [1, 2, 3, 4, 5, 6].map(uuid) }).success).toBe(false)
  })
})
