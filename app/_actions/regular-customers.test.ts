import { afterEach, describe, expect, it, vi } from 'vitest'
import { awardRegular, revokeRegular, updateRegularNote } from './regular-customers'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const targetUserId = '22222222-2222-4222-8222-222222222222'
const cafeId = '11111111-1111-4111-8111-111111111111'

function buildSupabaseStub(
  options: {
    user?: { id: string } | null
    result?: { data?: unknown; error?: unknown }
    /** 連続する呼び出しごとに違う結果を返したいとき（例: INSERT失敗 → 再認定UPDATE） */
    results?: { data?: unknown; error?: unknown }[]
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const results = options.results ?? [
    options.result ?? { data: { user_id: targetUserId }, error: null },
  ]

  const maybeSingle = vi.fn()
  for (const result of results) maybeSingle.mockImplementationOnce(async () => result)
  maybeSingle.mockImplementation(async () => results[results.length - 1])

  const chain = {
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    not: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle,
  }
  const from = vi.fn(() => chain)

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    },
    spies: chain,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('awardRegular', () => {
  const validInput = { cafeId, userId: targetUserId, note: 'いつもありがとうございます' }

  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await awardRegular({ cafeId: 'not-a-uuid', userId: targetUserId })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await awardRegular(validInput)

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は awarded_by をセッションのuser.idで挿入する', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await awardRegular(validInput)

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        cafe_id: cafeId,
        user_id: targetUserId,
        awarded_by: userId,
        note: 'いつもありがとうございます',
      }),
    )
  })

  it('重複（主キー違反）で、対象が既に有効な常連なら ALREADY_REGULAR を返す', async () => {
    const { stub } = buildSupabaseStub({
      results: [
        { data: null, error: { code: '23505', message: 'duplicate key' } },
        // 再認定UPDATEが revoked_at IS NOT NULL に一致せず0件（=既に有効）
        { data: null, error: null },
      ],
    })
    createClientMock.mockResolvedValue(stub)

    const result = await awardRegular(validInput)

    expect(result).toEqual({ ok: false, error: 'ALREADY_REGULAR' })
  })

  it('重複（主キー違反）で、対象が取消済みなら再認定として成功する', async () => {
    const { stub, spies } = buildSupabaseStub({
      results: [
        { data: null, error: { code: '23505', message: 'duplicate key' } },
        { data: { user_id: targetUserId }, error: null },
      ],
    })
    createClientMock.mockResolvedValue(stub)

    const result = await awardRegular(validInput)

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: null, awarded_by: userId }),
    )
    expect(spies.not).toHaveBeenCalledWith('revoked_at', 'is', null)
  })

  it('RLS(42501) は FORBIDDEN を返す（他人のカフェ / suspended オーナー）', async () => {
    const { stub } = buildSupabaseStub({
      result: { data: null, error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await awardRegular(validInput)

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      result: { data: null, error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await awardRegular(validInput)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })

  it('エラーが無いのに0件（RLSに0件で弾かれた）なら FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({ result: { data: null, error: null } })
    createClientMock.mockResolvedValue(stub)

    const result = await awardRegular(validInput)

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('revokeRegular', () => {
  const validInput = { cafeId, userId: targetUserId }

  it('不正な入力は INVALID_INPUT を返す', async () => {
    const result = await revokeRegular({ cafeId: 'not-a-uuid', userId: targetUserId })
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await revokeRegular(validInput)
    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は revoked_at を設定して update する', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await revokeRegular(validInput)

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: expect.any(String) }),
    )
  })

  it('他人のカフェ・存在しない組み合わせは FORBIDDEN を返す', async () => {
    const { stub } = buildSupabaseStub({ result: { data: null, error: null } })
    createClientMock.mockResolvedValue(stub)

    const result = await revokeRegular(validInput)
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('updateRegularNote', () => {
  const validInput = { cafeId, userId: targetUserId, note: '新しいメモ' }

  it('不正な入力は INVALID_INPUT を返す', async () => {
    const result = await updateRegularNote({ cafeId, userId: targetUserId, note: 'x'.repeat(501) })
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
  })

  it('成功時は note を更新する', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await updateRegularNote(validInput)

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.update).toHaveBeenCalledWith({ note: '新しいメモ' })
  })
})
