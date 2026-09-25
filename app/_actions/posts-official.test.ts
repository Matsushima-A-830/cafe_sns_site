import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOfficialPost } from './posts-official'

const { createClientMock, verifyNoGpsExifMock, deletePostImagesMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  verifyNoGpsExifMock: vi.fn(),
  deletePostImagesMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

// A10: createPost と同じ保険。verifyNoGpsExif 自体の検証は
// lib/storage/post-image-verify.test.ts（実Storage経由）で行う
vi.mock('@/lib/storage/post-image-verify', () => ({
  verifyNoGpsExif: verifyNoGpsExifMock,
}))
vi.mock('@/lib/storage/post-images', () => ({
  deletePostImages: deletePostImagesMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const postId = '11111111-1111-4111-8111-111111111111'
const imagePathA = `${userId}/${postId}/a.webp`
const imagePathB = `${userId}/${postId}/b.webp`

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '本日のおすすめです' }] }],
}

type RpcResult = { error?: unknown }

function buildSupabaseStub(options: {
  rpc?: RpcResult
  checkNgWords?: { data?: string | null; error?: unknown }
}) {
  const rpc = vi.fn((fnName: string) => {
    if (fnName === 'check_ng_words') {
      return Promise.resolve(options.checkNgWords ?? { data: null, error: null })
    }
    return Promise.resolve(options.rpc ?? { error: null })
  })

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
      rpc,
    },
    spies: { rpc },
  }
}

function todaySpecialInput(imagePaths: string[]) {
  return {
    officialFormat: 'today_special' as const,
    postId,
    bodyJson,
    imagePaths,
    metadata: { v: 1 as const, menu_name: '季節のタルト', price_yen: 600, valid_until: null },
  }
}

beforeEach(() => {
  verifyNoGpsExifMock.mockResolvedValue({ ok: true, data: null })
  deletePostImagesMock.mockResolvedValue({ ok: true, data: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('createOfficialPost の GPS 再検証（A10）', () => {
  it('imagePaths が空なら verifyNoGpsExif を呼ばない', async () => {
    const { stub } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createOfficialPost({
      officialFormat: 'closure',
      postId,
      metadata: {
        v: 1,
        closure_type: 'closed',
        starts_on: '2026-09-25',
        ends_on: '2026-09-26',
        reason: '臨時休業',
      },
    })

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(verifyNoGpsExifMock).not.toHaveBeenCalled()
  })

  it('GPSを検出したら EXIF_STRIP_FAILED を返し、該当画像を削除して finalize_official_post を呼ばない', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)
    verifyNoGpsExifMock.mockResolvedValue({ ok: false, error: 'EXIF_STRIP_FAILED' })

    const result = await createOfficialPost(todaySpecialInput([imagePathA, imagePathB]))

    expect(result).toEqual({ ok: false, error: 'EXIF_STRIP_FAILED' })
    expect(verifyNoGpsExifMock).toHaveBeenCalledWith(stub, [imagePathA, imagePathB])
    expect(deletePostImagesMock).toHaveBeenCalledWith(stub, [imagePathA, imagePathB])
    expect(spies.rpc).not.toHaveBeenCalledWith('finalize_official_post', expect.anything())
  })

  it('GPS検出後の画像削除自体が失敗しても握り潰さず details に残す', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)
    verifyNoGpsExifMock.mockResolvedValue({ ok: false, error: 'EXIF_STRIP_FAILED' })
    deletePostImagesMock.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR', details: 'boom' })

    const result = await createOfficialPost(todaySpecialInput([imagePathA]))

    expect(result).toEqual({
      ok: false,
      error: 'EXIF_STRIP_FAILED',
      details: { cleanupFailed: 'boom' },
    })
    expect(spies.rpc).not.toHaveBeenCalledWith('finalize_official_post', expect.anything())
  })

  it('GPSが無ければ finalize_official_post まで到達する', async () => {
    const { stub, spies } = buildSupabaseStub({})
    createClientMock.mockResolvedValue(stub)

    const result = await createOfficialPost(todaySpecialInput([imagePathA]))

    expect(result).toEqual({ ok: true, data: { postId } })
    expect(spies.rpc).toHaveBeenCalledWith(
      'finalize_official_post',
      expect.objectContaining({ p_image_paths: [imagePathA] }),
    )
  })
})
