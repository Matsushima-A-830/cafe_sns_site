import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCafe } from './cafes'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const cafeId = '11111111-1111-4111-8111-111111111111'

const validInput = {
  name: '喫茶ソラ',
  prefecture: '東京都',
  city: '渋谷区',
}

function buildSupabaseStub(
  options: {
    user?: { id: string } | null
    insertResult?: { data: { id: string } | null; error?: unknown }
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const insertResult = options.insertResult ?? { data: { id: cafeId }, error: null }

  const insertChain = {
    select: vi.fn(() => ({ single: vi.fn().mockResolvedValue(insertResult) })),
  }
  const cafesTable = { insert: vi.fn(() => insertChain) }
  const from = vi.fn(() => cafesTable)

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    },
    spies: { insert: cafesTable.insert },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('createCafe', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await createCafe({ name: '', prefecture: '', city: '' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await createCafe(validInput)

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は作成した cafeId を返し、created_by に自分の id をセットする', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await createCafe(validInput)

    expect(result).toEqual({ ok: true, data: { cafeId } })
    expect(spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '喫茶ソラ',
        prefecture: '東京都',
        city: '渋谷区',
        created_by: userId,
      }),
    )
  })

  it('website の空文字は null として送る（未入力扱い）', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await createCafe({ ...validInput, website: '' })

    expect(spies.insert).toHaveBeenCalledWith(expect.objectContaining({ website: null }))
  })

  it('area_code の FK 違反は AREA_CODE_UNKNOWN を返す', async () => {
    const { stub } = buildSupabaseStub({
      insertResult: {
        data: null,
        error: { code: '23503', message: 'violates foreign key constraint "cafes_area_code_fkey"' },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createCafe({ ...validInput, areaCode: 'unknown' })

    expect(result).toEqual({ ok: false, error: 'AREA_CODE_UNKNOWN' })
  })

  it('RLS(42501) は FORBIDDEN を返す（suspended / pending_consent）', async () => {
    const { stub } = buildSupabaseStub({
      insertResult: { data: null, error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createCafe(validInput)

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      insertResult: { data: null, error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await createCafe(validInput)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
