import { describe, expect, it } from 'vitest'
import { uploadSignSchema } from './uploads'

const validPostId = '11111111-1111-4111-8111-111111111111'

describe('uploadSignSchema', () => {
  it('正しい入力を通す', () => {
    const result = uploadSignSchema.safeParse({
      postId: validPostId,
      contentType: 'image/webp',
      fileSize: 1024,
    })
    expect(result.success).toBe(true)
  })

  it('uuid でない postId を弾く', () => {
    const result = uploadSignSchema.safeParse({
      postId: 'not-a-uuid',
      contentType: 'image/webp',
      fileSize: 1024,
    })
    expect(result.success).toBe(false)
  })

  it('contentType が空文字だと弾く', () => {
    const result = uploadSignSchema.safeParse({
      postId: validPostId,
      contentType: '',
      fileSize: 1024,
    })
    expect(result.success).toBe(false)
  })

  it('サイズ・MIMEの妥当性そのものは弾かない（createPostImageUploadUrl 側の責務）', () => {
    const result = uploadSignSchema.safeParse({
      postId: validPostId,
      contentType: 'image/png',
      fileSize: 10 * 1024 * 1024 + 1,
    })
    expect(result.success).toBe(true)
  })

  it('負の fileSize を弾く', () => {
    const result = uploadSignSchema.safeParse({
      postId: validPostId,
      contentType: 'image/webp',
      fileSize: -1,
    })
    expect(result.success).toBe(false)
  })

  it('整数でない fileSize を弾く', () => {
    const result = uploadSignSchema.safeParse({
      postId: validPostId,
      contentType: 'image/webp',
      fileSize: 1024.5,
    })
    expect(result.success).toBe(false)
  })
})
