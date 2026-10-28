import { describe, expect, it, vi } from 'vitest'
import { getCafeDetail } from './cafe-detail'

const cafeId = '11111111-1111-4111-8111-111111111111'
const CAFE_IMAGE_URL_PREFIX = 'http://127.0.0.1:54321/storage/v1/object/public/cafe-images'
const POST_IMAGE_URL_PREFIX = 'http://127.0.0.1:54321/storage/v1/object/public/post-images'

function buildCafeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: cafeId,
    name: 'カフェソラ',
    prefecture: '東京都',
    city: '渋谷区',
    address: null,
    phone: null,
    website: null,
    description: null,
    verified_owner_id: null,
    cafe_lat: null,
    cafe_lng: null,
    main_image_path: null,
    areas: null,
    ...overrides,
  }
}

/** 投稿グリッド経由のフォールバック問い合わせは thenable なチェーンとしてスタブ化する */
function buildPostsChain(postImagePath: string | null) {
  // biome-ignore lint/suspicious/noExplicitAny: supabase-js のクエリビルダ全体の型は満たさない最小スタブ
  const chain: any = {}
  const methods = ['select', 'eq', 'is', 'order']
  for (const method of methods) {
    chain[method] = vi.fn(() => chain)
  }
  chain.limit = vi.fn(() => chain)
  // biome-ignore lint/suspicious/noThenProperty: supabase-js のクエリビルダ自体が thenable なので、その挙動を模す
  chain.then = (resolve: (value: { data: unknown; error: null }) => void) =>
    resolve({
      data: postImagePath
        ? [{ post_images: [{ storage_path: postImagePath, display_order: 0 }] }]
        : [],
      error: null,
    })
  return chain
}

function buildSupabaseStub(options: {
  cafeRow: ReturnType<typeof buildCafeRow>
  fallbackPostImagePath?: string | null
}) {
  const cafesTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: options.cafeRow, error: null }),
      })),
    })),
  }

  const hoursTable = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [], error: null }) })),
    })),
  }

  const postsTable = buildPostsChain(options.fallbackPostImagePath ?? null)

  const from = vi.fn((table: string) => {
    if (table === 'cafes') return cafesTable
    if (table === 'cafe_business_hours') return hoursTable
    if (table === 'posts') return postsTable
    throw new Error(`unexpected table: ${table}`)
  })

  const storage = {
    from: vi.fn((bucket: string) => ({
      getPublicUrl: (path: string) => ({
        data: {
          publicUrl:
            bucket === 'cafe-images'
              ? `${CAFE_IMAGE_URL_PREFIX}/${path}`
              : `${POST_IMAGE_URL_PREFIX}/${path}`,
        },
      }),
    })),
  }

  return { from, storage, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }
}

describe('getCafeDetail: ヒーロー画像の優先順位', () => {
  it('main_image_path が設定されていればそれを優先する', async () => {
    const stub = buildSupabaseStub({
      cafeRow: buildCafeRow({ main_image_path: `${cafeId}/main.webp` }),
      fallbackPostImagePath: 'author-1/post-1/fallback.webp',
    })

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await getCafeDetail(stub as any, cafeId)

    expect(result?.heroImageUrl).toBe(`${CAFE_IMAGE_URL_PREFIX}/${cafeId}/main.webp`)
  })

  it('main_image_path が未設定なら最新投稿の1枚目にフォールバックする', async () => {
    const stub = buildSupabaseStub({
      cafeRow: buildCafeRow({ main_image_path: null }),
      fallbackPostImagePath: 'author-1/post-1/fallback.webp',
    })

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await getCafeDetail(stub as any, cafeId)

    expect(result?.heroImageUrl).toBe(`${POST_IMAGE_URL_PREFIX}/author-1/post-1/fallback.webp`)
  })

  it('main_image_path も投稿も無ければ null', async () => {
    const stub = buildSupabaseStub({
      cafeRow: buildCafeRow({ main_image_path: null }),
      fallbackPostImagePath: null,
    })

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await getCafeDetail(stub as any, cafeId)

    expect(result?.heroImageUrl).toBeNull()
  })

  it('返り値に mainImagePath という中間フィールドを漏らさない', async () => {
    const stub = buildSupabaseStub({
      cafeRow: buildCafeRow({ main_image_path: `${cafeId}/main.webp` }),
    })

    // biome-ignore lint/suspicious/noExplicitAny: 同上
    const result = await getCafeDetail(stub as any, cafeId)

    expect(result).not.toHaveProperty('mainImagePath')
  })
})
