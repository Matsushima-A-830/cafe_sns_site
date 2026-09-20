import { afterEach, describe, expect, it, vi } from 'vitest'
import { markAllNotificationsAsRead, markNotificationAsRead } from './notifications'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const notificationId = '11111111-1111-4111-8111-111111111111'

/**
 * `.eq()` / `.is()` を積み重ねた末に `await` されるだけの単純なクエリチェーンを模す。
 *   app/_actions/bookmarks.test.ts と同じ形
 */
function makeChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['update', 'eq', 'is']) {
    chain[method] = vi.fn(() => chain)
  }
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(terminalResult).then(resolve, reject),
  })
  return chain
}

function buildSupabaseStub(
  options: { user?: { id: string } | null; updateResult?: { error?: unknown } } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const updateResult = options.updateResult ?? { error: null }

  const chain = makeChain(updateResult)
  const notificationsTable = { update: vi.fn(() => chain) }
  const from = vi.fn(() => notificationsTable)

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    },
    spies: { update: notificationsTable.update, eq: chain.eq, is: chain.is },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('markNotificationAsRead', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await markNotificationAsRead({ notificationId: 'not-a-uuid' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await markNotificationAsRead({ notificationId })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は null を返し、本人の未読行だけを対象にする', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await markNotificationAsRead({ notificationId })

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.update).toHaveBeenCalledWith({ read_at: expect.any(String) })
    expect(spies.eq).toHaveBeenCalledWith('id', notificationId)
    expect(spies.eq).toHaveBeenCalledWith('recipient_id', userId)
    expect(spies.is).toHaveBeenCalledWith('read_at', null)
  })

  it('対象外（他人の通知・既読済み）の0件更新も成功として返す', async () => {
    const { stub } = buildSupabaseStub({ updateResult: { error: null } })
    createClientMock.mockResolvedValue(stub)

    const result = await markNotificationAsRead({ notificationId })

    expect(result).toEqual({ ok: true, data: null })
  })

  it('想定外のエラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      updateResult: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await markNotificationAsRead({ notificationId })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})

describe('markAllNotificationsAsRead', () => {
  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await markAllNotificationsAsRead()

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は本人の未読すべてを既読化する', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await markAllNotificationsAsRead()

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.eq).toHaveBeenCalledWith('recipient_id', userId)
    expect(spies.is).toHaveBeenCalledWith('read_at', null)
  })

  it('想定外のエラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      updateResult: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await markAllNotificationsAsRead()

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
