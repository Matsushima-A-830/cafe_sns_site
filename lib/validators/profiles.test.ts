import { describe, expect, it } from 'vitest'
import { profileEditSchema } from './profiles'

describe('profileEditSchema', () => {
  it('displayName のみでも通す（bio/avatarUrl は任意）', () => {
    const result = profileEditSchema.safeParse({ displayName: 'たろう' })
    expect(result.success).toBe(true)
  })

  it('avatars バケットの公開URLは通す', () => {
    const result = profileEditSchema.safeParse({
      displayName: 'たろう',
      avatarUrl: 'http://127.0.0.1:54321/storage/v1/object/public/avatars/user-1/abc.webp',
    })
    expect(result.success).toBe(true)
  })

  it('別バケットの公開URLは弾く', () => {
    const result = profileEditSchema.safeParse({
      displayName: 'たろう',
      avatarUrl: 'http://127.0.0.1:54321/storage/v1/object/public/post-images/a/b/c.webp',
    })
    expect(result.success).toBe(false)
  })

  it('自前の Storage 以外の外部URLは弾く', () => {
    const result = profileEditSchema.safeParse({
      displayName: 'たろう',
      avatarUrl: 'https://evil.example.com/tracker.png',
    })
    expect(result.success).toBe(false)
  })

  it('表示名が空文字は弾く', () => {
    const result = profileEditSchema.safeParse({ displayName: '' })
    expect(result.success).toBe(false)
  })
})
