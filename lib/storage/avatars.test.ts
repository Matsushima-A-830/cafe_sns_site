import { describe, expect, it } from 'vitest'
import { AVATAR_MAX_BYTES, buildAvatarPath, validateAvatarUpload } from './avatars'

describe('buildAvatarPath', () => {
  it('先頭セグメントを userId に固定した webp パスを生成する', () => {
    const path = buildAvatarPath('user-1')
    expect(path).toMatch(
      /^user-1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/,
    )
  })

  it('呼び出すたびに異なるファイル名になる', () => {
    const first = buildAvatarPath('user-1')
    const second = buildAvatarPath('user-1')
    expect(first).not.toBe(second)
  })
})

describe('validateAvatarUpload', () => {
  it('image/webp かつ上限以下なら通す', () => {
    const result = validateAvatarUpload({ contentType: 'image/webp', fileSize: 1024 })
    expect(result).toEqual({ ok: true, data: null })
  })

  it('webp 以外は UNSUPPORTED_MEDIA_TYPE', () => {
    const result = validateAvatarUpload({ contentType: 'image/jpeg', fileSize: 1024 })
    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })

  it('上限ちょうどは通す', () => {
    const result = validateAvatarUpload({ contentType: 'image/webp', fileSize: AVATAR_MAX_BYTES })
    expect(result.ok).toBe(true)
  })

  it('上限超過は FILE_TOO_LARGE', () => {
    const result = validateAvatarUpload({
      contentType: 'image/webp',
      fileSize: AVATAR_MAX_BYTES + 1,
    })
    expect(result).toEqual({ ok: false, error: 'FILE_TOO_LARGE' })
  })

  it('形式違反はサイズより先に検出する', () => {
    const result = validateAvatarUpload({
      contentType: 'image/jpeg',
      fileSize: AVATAR_MAX_BYTES + 1,
    })
    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })
})
