import { describe, expect, it } from 'vitest'
import { isStoragePublicUrl, storagePathFromPublicUrl } from './public-url'

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

describe('storagePathFromPublicUrl', () => {
  it('指定バケットの公開URLからオブジェクトパスを取り出す', () => {
    expect(
      storagePathFromPublicUrl(
        'avatars',
        'http://127.0.0.1:54321/storage/v1/object/public/avatars/user-1/abc.webp',
      ),
    ).toBe('user-1/abc.webp')
  })

  it('バケットが違う場合は null', () => {
    expect(
      storagePathFromPublicUrl(
        'avatars',
        'http://127.0.0.1:54321/storage/v1/object/public/post-images/a/b/c.webp',
      ),
    ).toBeNull()
  })

  it('自前の Storage 公開URLでない場合は null', () => {
    expect(storagePathFromPublicUrl('avatars', 'https://cdn.example.com/a.webp')).toBeNull()
  })

  it('URLとして壊れていても落ちない', () => {
    expect(storagePathFromPublicUrl('avatars', 'javascript:alert(1)')).toBeNull()
    expect(storagePathFromPublicUrl('avatars', '')).toBeNull()
  })
})
