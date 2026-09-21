import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateProfile } from './profiles'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'

function buildSupabaseStub(
  options: { user?: { id: string } | null; updateResult?: { error?: unknown } } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const updateResult = options.updateResult ?? { error: null }

  const single = vi.fn().mockResolvedValue(updateResult)
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const profilesTable = { update }

  const from = vi.fn(() => profilesTable)

  return {
    stub: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, from },
    spies: { update, eq },
  }
}

afterEach(() => {
  vi.clearAllMocks()
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
})
