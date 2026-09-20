import { describe, expect, it } from 'vitest'
import { blockUserSchema } from './blocks'

const targetUserId = '11111111-1111-4111-8111-111111111111'

describe('blockUserSchema', () => {
  it('uuid の targetUserId を受け付ける', () => {
    expect(blockUserSchema.safeParse({ targetUserId }).success).toBe(true)
  })

  it('uuid でない targetUserId は弾く', () => {
    expect(blockUserSchema.safeParse({ targetUserId: 'not-a-uuid' }).success).toBe(false)
  })

  it('targetUserId が無いと弾く', () => {
    expect(blockUserSchema.safeParse({}).success).toBe(false)
  })
})
