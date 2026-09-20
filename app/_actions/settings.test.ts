import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateSettings } from './settings'

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

  const eq = vi.fn().mockResolvedValue(updateResult)
  const update = vi.fn(() => ({ eq }))
  const userSettingsTable = { update }

  const from = vi.fn(() => userSettingsTable)

  return {
    stub: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, from },
    spies: { update, eq },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('updateSettings', () => {
  it('不正な入力（空オブジェクト）は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await updateSettings({})

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await updateSettings({ notifyLike: false })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('指定した項目だけを camelCase から snake_case に変換して更新する', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await updateSettings({ useLocation: false, fontScale: 'large' })

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.update).toHaveBeenCalledWith({ use_location: false, font_scale: 'large' })
    expect(spies.eq).toHaveBeenCalledWith('user_id', userId)
  })

  it('更新に失敗したら INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      updateResult: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateSettings({ notifyLike: true })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
