import { afterEach, describe, expect, it, vi } from 'vitest'
import { addNgWord, deleteNgWord, listNgWords } from './admin-ng-words'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

const adminId = '11111111-1111-4111-8111-111111111111'
const ngWordId = '22222222-2222-4222-8222-222222222222'

/** select().eq()... の末に await されるチェーンを模す（admin-reports.test.ts と同じ手法） */
function makeChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'insert', 'delete']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult)
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(terminalResult).then(resolve, reject),
  })
  return chain
}

type Options = {
  user?: { id: string } | null
  role?: string | null
  status?: string | null
  ngWordsSelectList?: { data: unknown[] | null; error?: unknown }
  ngWordsInsert?: { data: unknown | null; error?: unknown }
  ngWordsDelete?: { error?: unknown; count?: number | null }
}

function mockClient(options: Options = {}) {
  const user = 'user' in options ? options.user : { id: adminId }
  const role = 'role' in options ? options.role : 'admin'
  const status = 'status' in options ? options.status : 'active'

  const profilesTable = {
    select: vi.fn(() => makeChain({ data: { role, status }, error: null })),
  }
  const ngWordsTable = {
    select: vi.fn(() => ({
      order: vi.fn().mockResolvedValue(options.ngWordsSelectList ?? { data: [], error: null }),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi
          .fn()
          .mockResolvedValue(options.ngWordsInsert ?? { data: { id: ngWordId }, error: null }),
      })),
    })),
    delete: vi.fn(() => makeChain(options.ngWordsDelete ?? { error: null, count: 1 })),
  }

  const from = vi.fn((table: string) => (table === 'profiles' ? profilesTable : ngWordsTable))

  return {
    stub: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, from },
    spies: { insert: ngWordsTable.insert, delete: ngWordsTable.delete },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('requireAdmin ガード（listNgWords 経由で検証）', () => {
  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = mockClient({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await listNgWords()

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('role が admin でなければ FORBIDDEN を返す', async () => {
    const { stub } = mockClient({ role: 'user' })
    createClientMock.mockResolvedValue(stub)

    const result = await listNgWords()

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('role=admin でも status が active でなければ FORBIDDEN を返す（停止済みadmin対策）', async () => {
    const { stub } = mockClient({ status: 'suspended' })
    createClientMock.mockResolvedValue(stub)

    const result = await listNgWords()

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('listNgWords', () => {
  it('word 昇順で一覧を返す', async () => {
    const { stub } = mockClient({
      ngWordsSelectList: {
        data: [{ id: ngWordId, word: 'あ', severity: 'block', category: null, created_at: 'x' }],
        error: null,
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await listNgWords()

    expect(result).toEqual({
      ok: true,
      data: [{ id: ngWordId, word: 'あ', severity: 'block', category: null, createdAt: 'x' }],
    })
  })
})

describe('addNgWord', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await addNgWord({ word: '', severity: 'block' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('admin は追加できる', async () => {
    const { stub, spies } = mockClient()
    createClientMock.mockResolvedValue(stub)

    const result = await addNgWord({ word: '新語', severity: 'warn' })

    expect(result).toEqual({ ok: true, data: { ngWordId } })
    expect(spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({ word: '新語', severity: 'warn' }),
    )
  })

  it('重複した word は CONFLICT を返す', async () => {
    const { stub } = mockClient({
      ngWordsInsert: { data: null, error: { code: '23505', message: 'duplicate' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await addNgWord({ word: '既存語', severity: 'block' })

    expect(result).toEqual({ ok: false, error: 'CONFLICT' })
  })
})

describe('deleteNgWord', () => {
  it('不正な入力は INVALID_INPUT を返す', async () => {
    const result = await deleteNgWord({ ngWordId: 'not-a-uuid' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('admin は削除できる', async () => {
    const { stub, spies } = mockClient()
    createClientMock.mockResolvedValue(stub)

    const result = await deleteNgWord({ ngWordId })

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.delete).toHaveBeenCalled()
  })
})
