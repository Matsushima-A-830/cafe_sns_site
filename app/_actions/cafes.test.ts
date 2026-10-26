import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCafe, updateCafe } from './cafes'

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
const cafeId = '11111111-1111-4111-8111-111111111111'
const CAFE_IMAGE_URL_PREFIX = 'http://127.0.0.1:54321/storage/v1/object/public/cafe-images'

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
    currentMainImagePath?: string | null
    rpcError?: unknown
    removeResult?: { error?: unknown }
  } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const updateResult = options.updateResult ?? { data: { id: cafeId }, error: null }
  const currentMainImagePath = options.currentMainImagePath ?? null
  const removeResult = options.removeResult ?? { error: null }

  const updateChain = {
    eq: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn().mockResolvedValue(updateResult) })),
    })),
  }
  const cafesTable = { update: vi.fn(() => updateChain) }
  const from = vi.fn(() => cafesTable)

  const rpc = vi.fn().mockResolvedValue({
    data: [{ main_image_path: currentMainImagePath }],
    error: options.rpcError,
  })

  const remove = vi.fn().mockResolvedValue(removeResult)
  const storage = { from: vi.fn(() => ({ remove })) }

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
      rpc,
      storage,
    },
    spies: { update: cafesTable.update, rpc, remove, storageFrom: storage.from },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

beforeEach(() => {
  verifyNoGpsExifMock.mockResolvedValue({ ok: true, data: null })
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

  it('mainImageUrl が無い呼び出しは現在のメイン画像を読まず main_image_path も更新しない', async () => {
    const { stub, spies } = buildUpdateSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    await updateCafe(validUpdateInput)

    expect(spies.rpc).not.toHaveBeenCalled()
    expect(spies.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ main_image_path: expect.anything() }),
    )
  })

  it('cafe-images バケットの公開URLで main_image_path を更新する', async () => {
    const { stub, spies } = buildUpdateSupabaseStub()
    createClientMock.mockResolvedValue(stub)
    const newMainImageUrl = `${CAFE_IMAGE_URL_PREFIX}/${cafeId}/new.webp`

    const result = await updateCafe({ ...validUpdateInput, mainImageUrl: newMainImageUrl })

    expect(result).toEqual({ ok: true, data: { cafeId } })
    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ main_image_path: `${cafeId}/new.webp` }),
    )
    expect(verifyNoGpsExifMock).toHaveBeenCalledWith(stub, [`${cafeId}/new.webp`], 'cafe-images')
  })

  it('新しいメイン画像にGPSが検出されたら EXIF_STRIP_FAILED を返し、更新せずファイルを削除する（A10）', async () => {
    verifyNoGpsExifMock.mockResolvedValue({ ok: false, error: 'EXIF_STRIP_FAILED' })
    const { stub, spies } = buildUpdateSupabaseStub()
    createClientMock.mockResolvedValue(stub)
    const newMainImageUrl = `${CAFE_IMAGE_URL_PREFIX}/${cafeId}/new.webp`

    const result = await updateCafe({ ...validUpdateInput, mainImageUrl: newMainImageUrl })

    expect(result).toEqual({ ok: false, error: 'EXIF_STRIP_FAILED' })
    expect(spies.update).not.toHaveBeenCalled()
    expect(spies.remove).toHaveBeenCalledWith([`${cafeId}/new.webp`])
  })

  it('メイン画像差し替え時は旧ファイルを削除する（D3と同じ方針）', async () => {
    const oldPath = `${cafeId}/old.webp`
    const { stub, spies } = buildUpdateSupabaseStub({ currentMainImagePath: oldPath })
    createClientMock.mockResolvedValue(stub)
    const newMainImageUrl = `${CAFE_IMAGE_URL_PREFIX}/${cafeId}/new.webp`

    await updateCafe({ ...validUpdateInput, mainImageUrl: newMainImageUrl })

    expect(spies.storageFrom).toHaveBeenCalledWith('cafe-images')
    expect(spies.remove).toHaveBeenCalledWith([oldPath])
  })

  it('メイン画像が変わっていなければ削除しない', async () => {
    const samePath = `${cafeId}/same.webp`
    const { stub, spies } = buildUpdateSupabaseStub({ currentMainImagePath: samePath })
    createClientMock.mockResolvedValue(stub)

    await updateCafe({ ...validUpdateInput, mainImageUrl: `${CAFE_IMAGE_URL_PREFIX}/${samePath}` })

    expect(spies.remove).not.toHaveBeenCalled()
  })

  it('現在のメイン画像取得(RPC)に失敗したら INTERNAL_ERROR を返し、更新しない', async () => {
    const { stub, spies } = buildUpdateSupabaseStub({ rpcError: { message: 'boom' } })
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafe({
      ...validUpdateInput,
      mainImageUrl: `${CAFE_IMAGE_URL_PREFIX}/${cafeId}/new.webp`,
    })

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
    expect(spies.update).not.toHaveBeenCalled()
  })
})
