import { describe, expect, it } from 'vitest'
import { isStoragePublicUrl } from './public-url'

describe('isStoragePublicUrl', () => {
  it('Supabase Storage の公開URLを判定する', () => {
    expect(
      isStoragePublicUrl('http://127.0.0.1:54321/storage/v1/object/public/post-images/a/b/c.webp'),
    ).toBe(true)
  })

  it('別ホスト・別パスは false', () => {
    expect(isStoragePublicUrl('https://cdn.example.com/a.webp')).toBe(false)
    expect(isStoragePublicUrl('http://127.0.0.1:54321/storage/v1/object/sign/x.webp')).toBe(false)
  })

  it('URLとして壊れていても落ちない', () => {
    expect(isStoragePublicUrl('javascript:alert(1)')).toBe(false)
    expect(isStoragePublicUrl('')).toBe(false)
  })
})
