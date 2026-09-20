import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockUser, listBlockedUsers, unblockUser } from './blocks'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const targetUserId = '11111111-1111-4111-8111-111111111111'

/**
 * `.eq()` / `.order()` を積み重ねた末に `await` されるだけの単純なクエリチェーンを模す
 *   app/_actions/bookmarks.test.ts と同じ形
 */
function makeChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order']) {
    chain[method] = vi.fn(() => chain)
  }
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(terminalResult).then(resolve, reject),
  })
  return chain
}

function buildSupabaseStub(
  options: {
    user?: { id: string } | null
    blocksInsert?: { data: { blocked_id: string } | null; error?: unknown }
    blocksDelete?: { error?: unknown }
    blocksSelect?: { data: unknown; error?: unknown }
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const blocksInsertResult = options.blocksInsert ?? {
    data: { blocked_id: targetUserId },
    error: null,
  }
  const blocksDeleteResult = options.blocksDelete ?? { error: null }
  const blocksSelectResult = options.blocksSelect ?? { data: [], error: null }

  const blocksInsertChain = {
    select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(blocksInsertResult) })),
  }
  const blocksTable = {
    insert: vi.fn(() => blocksInsertChain),
    delete: vi.fn(() => makeChain(blocksDeleteResult)),
    select: vi.fn(() => makeChain(blocksSelectResult)),
  }

  const from = vi.fn(() => blocksTable)

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    },
    spies: { insert: blocksTable.insert, delete: blocksTable.delete, select: blocksTable.select },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('blockUser', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await blockUser({ targetUserId: 'not-a-uuid' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await blockUser({ targetUserId })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は ok を返す', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await blockUser({ targetUserId })

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.insert).toHaveBeenCalledWith({ blocker_id: userId, blocked_id: targetUserId })
  })

  it('エラーは無いが行が返らない（RLSに弾かれた）場合は FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({ blocksInsert: { data: null, error: null } })
    createClientMock.mockResolvedValue(stub)

    const result = await blockUser({ targetUserId })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('主キーの重複（既にブロック済み）は成功として返す', async () => {
    const { stub } = buildSupabaseStub({
      blocksInsert: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await blockUser({ targetUserId })

    expect(result).toEqual({ ok: true, data: null })
  })

  it('自己ブロックの CHECK 違反は BLOCK_SELF_FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({
      blocksInsert: {
        data: null,
        error: { code: '23514', message: 'violates check constraint "blocks_no_self_block"' },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await blockUser({ targetUserId })

    expect(result).toEqual({ ok: false, error: 'BLOCK_SELF_FORBIDDEN' })
  })

  it('RLS(42501) は FORBIDDEN を返す（suspended / pending_consent）', async () => {
    const { stub } = buildSupabaseStub({
      blocksInsert: { data: null, error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await blockUser({ targetUserId })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーコードは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      blocksInsert: { data: null, error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await blockUser({ targetUserId })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})

describe('unblockUser', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await unblockUser({ targetUserId: 'not-a-uuid' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await unblockUser({ targetUserId })

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時（対象外で0件削除の場合を含む）は ok を返す', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await unblockUser({ targetUserId })

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.delete).toHaveBeenCalled()
  })

  it('delete が失敗したら INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      blocksDelete: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await unblockUser({ targetUserId })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})

describe('listBlockedUsers', () => {
  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await listBlockedUsers()

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('ブロック済みプロフィールを整形して返す', async () => {
    const { stub } = buildSupabaseStub({
      blocksSelect: {
        data: [
          {
            blocked: {
              id: targetUserId,
              username: 'blocked_user',
              display_name: 'ブロック対象',
              avatar_url: null,
            },
          },
        ],
        error: null,
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await listBlockedUsers()

    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: targetUserId,
          username: 'blocked_user',
          displayName: 'ブロック対象',
          avatarUrl: null,
        },
      ],
    })
  })

  it('取得に失敗したら INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      blocksSelect: { data: null, error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await listBlockedUsers()

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
