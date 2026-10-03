import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateProfile } from './profiles'

const { createClientMock, verifyNoGpsExifMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  verifyNoGpsExifMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/storage/post-image-verify', () => ({
  verifyNoGpsExif: verifyNoGpsExifMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const AVATAR_URL_PREFIX = 'http://127.0.0.1:54321/storage/v1/object/public/avatars'

function buildSupabaseStub(
  options: {
    user?: { id: string } | null
    updateResult?: { error?: unknown }
    currentAvatarUrl?: string | null
    currentAvatarError?: unknown
    removeResult?: { error?: unknown }
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const updateResult = options.updateResult ?? { error: null }
  const currentAvatarUrl = options.currentAvatarUrl ?? null
  const removeResult = options.removeResult ?? { error: null }

  const updateSingle = vi.fn().mockResolvedValue(updateResult)
  const updateSelect = vi.fn(() => ({ single: updateSingle }))
  const updateEq = vi.fn(() => ({ select: updateSelect }))
  const update = vi.fn(() => ({ eq: updateEq }))

  const selectSingle = vi.fn().mockResolvedValue({
    data: { avatar_url: currentAvatarUrl },
    error: options.currentAvatarError,
  })
  const selectEq = vi.fn(() => ({ single: selectSingle }))
  const select = vi.fn(() => ({ eq: selectEq }))

  const profilesTable = { update, select }
  const from = vi.fn(() => profilesTable)

  const remove = vi.fn().mockResolvedValue(removeResult)
  const storage = { from: vi.fn(() => ({ remove })) }

  return {
    stub: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, from, storage },
    spies: { update, eq: updateEq, selectEq, remove, storageFrom: storage.from },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

beforeEach(() => {
  verifyNoGpsExifMock.mockResolvedValue({ ok: true, data: null })
})

describe('updateProfile', () => {
  it('不正な入力（表示名が空）は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await updateProfile({ displayName: '', bio: '' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await updateProfile({ displayName: '新しい名前' })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('display_name と bio だけを更新する', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await updateProfile({ displayName: '新しい名前', bio: '自己紹介です' })

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.update).toHaveBeenCalledWith({
      display_name: '新しい名前',
      bio: '自己紹介です',
    })
    expect(spies.eq).toHaveBeenCalledWith('id', userId)
  })

  it('bio を空文字にすると null で更新する（自己紹介を消す操作）', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await updateProfile({ displayName: '新しい名前', bio: '' })

    expect(spies.update).toHaveBeenCalledWith({ display_name: '新しい名前', bio: null })
  })

  it('username が紛れ込んでいても更新には含めない（変更不可のガード）', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await updateProfile({ displayName: '新しい名前', bio: '', username: 'hacked' })

    expect(spies.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ username: expect.anything() }),
    )
  })

  it('更新に失敗したら INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      updateResult: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateProfile({ displayName: '新しい名前' })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })

  it('avatarUrl が無い呼び出しは現在のアバターを読まず avatar_url も更新しない', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await updateProfile({ displayName: '新しい名前', bio: '' })

    expect(spies.update).toHaveBeenCalledWith({ display_name: '新しい名前', bio: null })
    expect(spies.selectEq).not.toHaveBeenCalled()
  })

  it('avatars バケットの公開URLで avatar_url を更新する', async () => {
    const { stub, spies } = buildSupabaseStub({ currentAvatarUrl: null })
    createClientMock.mockResolvedValue(stub)
    const newAvatarUrl = `${AVATAR_URL_PREFIX}/${userId}/new.webp`

    const result = await updateProfile({ displayName: '新しい名前', avatarUrl: newAvatarUrl })

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.update).toHaveBeenCalledWith({
      display_name: '新しい名前',
      bio: null,
      avatar_url: newAvatarUrl,
    })
    expect(verifyNoGpsExifMock).toHaveBeenCalledWith(stub, [`${userId}/new.webp`], 'avatars')
  })

  it('新しいアバターにGPSが検出されたら EXIF_STRIP_FAILED を返し、更新せずファイルを削除する（A10）', async () => {
    verifyNoGpsExifMock.mockResolvedValue({ ok: false, error: 'EXIF_STRIP_FAILED' })
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)
    const newAvatarUrl = `${AVATAR_URL_PREFIX}/${userId}/new.webp`

    const result = await updateProfile({ displayName: '新しい名前', avatarUrl: newAvatarUrl })

    expect(result).toEqual({ ok: false, error: 'EXIF_STRIP_FAILED' })
    expect(spies.update).not.toHaveBeenCalled()
    expect(spies.remove).toHaveBeenCalledWith([`${userId}/new.webp`])
  })

  it('GPS再検証が INTERNAL_ERROR を返したらそのまま返し、更新しない', async () => {
    verifyNoGpsExifMock.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' })
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await updateProfile({
      displayName: '新しい名前',
      avatarUrl: `${AVATAR_URL_PREFIX}/${userId}/new.webp`,
    })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
    expect(spies.update).not.toHaveBeenCalled()
  })

  it('アバター差し替え時は旧ファイルを削除する（D3）', async () => {
    const oldPath = `${userId}/old.webp`
    const { stub, spies } = buildSupabaseStub({
      currentAvatarUrl: `${AVATAR_URL_PREFIX}/${oldPath}`,
    })
    createClientMock.mockResolvedValue(stub)
    const newAvatarUrl = `${AVATAR_URL_PREFIX}/${userId}/new.webp`

    await updateProfile({ displayName: '新しい名前', avatarUrl: newAvatarUrl })

    expect(spies.storageFrom).toHaveBeenCalledWith('avatars')
    expect(spies.remove).toHaveBeenCalledWith([oldPath])
  })

  it('アバターが変わっていなければ削除しない', async () => {
    const sameUrl = `${AVATAR_URL_PREFIX}/${userId}/same.webp`
    const { stub, spies } = buildSupabaseStub({ currentAvatarUrl: sameUrl })
    createClientMock.mockResolvedValue(stub)

    await updateProfile({ displayName: '新しい名前', avatarUrl: sameUrl })

    expect(spies.remove).not.toHaveBeenCalled()
  })

  it('現在のアバター取得に失敗したら INTERNAL_ERROR を返し、更新しない', async () => {
    const { stub, spies } = buildSupabaseStub({
      currentAvatarUrl: null,
      currentAvatarError: { message: 'boom' },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateProfile({
      displayName: '新しい名前',
      avatarUrl: `${AVATAR_URL_PREFIX}/${userId}/new.webp`,
    })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
    expect(spies.update).not.toHaveBeenCalled()
  })

  it('旧アバターの削除に失敗してもプロフィール更新自体は成功扱いにする', async () => {
    const oldPath = `${userId}/old.webp`
    const { stub } = buildSupabaseStub({
      currentAvatarUrl: `${AVATAR_URL_PREFIX}/${oldPath}`,
      removeResult: { error: { message: 'storage down' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateProfile({
      displayName: '新しい名前',
      avatarUrl: `${AVATAR_URL_PREFIX}/${userId}/new.webp`,
    })

    expect(result).toEqual({ ok: true, data: null })
  })
})
