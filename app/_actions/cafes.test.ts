import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCafe, updateCafe } from './cafes'

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

function buildUpdateSupabaseStub(
  options: {
    user?: { id: string } | null
    updateResult?: { data: { id: string } | null; error?: unknown }
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const updateResult = options.updateResult ?? { data: { id: cafeId }, error: null }

  const updateChain = {
    eq: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn().mockResolvedValue(updateResult) })),
    })),
  }
  const cafesTable = { update: vi.fn(() => updateChain) }
  const from = vi.fn(() => cafesTable)

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    },
    spies: { update: cafesTable.update },
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

  it('未入力の任意項目（空文字）はすべて null として送る', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await createCafe({
      ...validInput,
      nameKana: '',
      address: '',
      phone: '',
      website: '',
      description: '',
    })

    // description が '' のまま入ると S_CAFE_DETAIL の `cafe.description ?? fallback`
    // が効かず空のメタ説明になる（??は空文字を弾けない）ため、必ず null で送る
    expect(spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name_kana: null,
        address: null,
        phone: null,
        website: null,
        description: null,
      }),
    )
  })

  it('lat/lng が両方あれば location を WKT で送る', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await createCafe({ ...validInput, lat: 35.658, lng: 139.7016 })

    expect(spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'SRID=4326;POINT(139.7016 35.658)' }),
    )
  })

  it('lat/lng が両方未指定なら location は null', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await createCafe(validInput)

    expect(spies.insert).toHaveBeenCalledWith(expect.objectContaining({ location: null }))
  })

  it('lat/lng が片方だけなら INVALID_INPUT を返す', async () => {
    const result = await createCafe({ ...validInput, lat: 35.658 })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
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

const validUpdateInput = { ...validInput, cafeId }

describe('updateCafe', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await updateCafe({ cafeId, name: '', prefecture: '', city: '' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildUpdateSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafe(validUpdateInput)

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は更新した cafeId を返す', async () => {
    const { stub, spies } = buildUpdateSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafe(validUpdateInput)

    expect(result).toEqual({ ok: true, data: { cafeId } })
    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: '喫茶ソラ', prefecture: '東京都', city: '渋谷区' }),
    )
  })

  it('externalIds は google_place_id / tabelog_url のキーで送る', async () => {
    const { stub, spies } = buildUpdateSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await updateCafe({
      ...validUpdateInput,
      externalIds: { googlePlaceId: 'ChIJxxx', tabelogUrl: 'https://tabelog.com/xxx' },
    })

    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        external_ids: { google_place_id: 'ChIJxxx', tabelog_url: 'https://tabelog.com/xxx' },
      }),
    )
  })

  it('0件更新（他人のカフェ）は NOT_OWNER を返す', async () => {
    const { stub } = buildUpdateSupabaseStub({
      updateResult: { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafe(validUpdateInput)

    expect(result).toEqual({ ok: false, error: 'NOT_OWNER' })
  })

  it('area_code の FK 違反は AREA_CODE_UNKNOWN を返す', async () => {
    const { stub } = buildUpdateSupabaseStub({
      updateResult: {
        data: null,
        error: { code: '23503', message: 'violates foreign key constraint "cafes_area_code_fkey"' },
      },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafe({ ...validUpdateInput, areaCode: 'unknown' })

    expect(result).toEqual({ ok: false, error: 'AREA_CODE_UNKNOWN' })
  })

  it('想定外のエラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildUpdateSupabaseStub({
      updateResult: { data: null, error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafe(validUpdateInput)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
