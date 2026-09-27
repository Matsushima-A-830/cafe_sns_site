import { afterEach, describe, expect, it, vi } from 'vitest'
import { backfillCafeLocations, countCafesMissingLocation } from './admin-cafe-locations'

const { createClientMock, geocodeAddressMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  geocodeAddressMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/geocoding/google', () => ({ geocodeAddress: geocodeAddressMock }))

const adminId = '11111111-1111-4111-8111-111111111111'
const cafeAId = '22222222-2222-4222-8222-222222222222'
const cafeBId = '33333333-3333-4333-8333-333333333333'

/** select().eq()... の末に await されるチェーンを模す（admin-ng-words.test.ts と同じ手法） */
function makeChain(terminalResult: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'update']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult)
  Object.defineProperty(chain, 'then', {
    value: (resolve: (value: unknown) => void, reject?: (error: unknown) => void) =>
      Promise.resolve(terminalResult).then(resolve, reject),
  })
  return chain
}

type MissingCafe = {
  id: string
  name: string
  prefecture: string
  city: string
  address: string | null
}

type Options = {
  user?: { id: string } | null
  role?: string | null
  status?: string | null
  missingCafes?: MissingCafe[]
  updateError?: { message: string } | null
  missingCount?: { count: number | null; error?: unknown }
}

function mockClient(options: Options = {}) {
  const user = 'user' in options ? options.user : { id: adminId }
  const role = 'role' in options ? options.role : 'admin'
  const status = 'status' in options ? options.status : 'active'

  const profilesTable = {
    select: vi.fn(() => makeChain({ data: { role, status }, error: null })),
  }

  const updateSpy = vi.fn(() => makeChain({ data: null, error: options.updateError ?? null }))

  const cafesTable = {
    select: vi.fn((_columns: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) {
        return {
          eq: vi.fn(() => ({
            is: vi
              .fn()
              .mockResolvedValue(
                options.missingCount ?? { count: options.missingCafes?.length ?? 0, error: null },
              ),
          })),
        }
      }
      return {
        eq: vi.fn(() => ({
          is: vi.fn().mockResolvedValue({ data: options.missingCafes ?? [], error: null }),
        })),
      }
    }),
    update: updateSpy,
  }

  const from = vi.fn((table: string) => (table === 'profiles' ? profilesTable : cafesTable))

  return {
    stub: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) }, from },
    spies: { update: updateSpy },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('requireAdmin ガード（countCafesMissingLocation 経由で検証）', () => {
  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = mockClient({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await countCafesMissingLocation()

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('role が admin でなければ FORBIDDEN を返す', async () => {
    const { stub } = mockClient({ role: 'user' })
    createClientMock.mockResolvedValue(stub)

    const result = await countCafesMissingLocation()

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })
})

describe('countCafesMissingLocation', () => {
  it('location が未設定かつ status=active の件数を返す', async () => {
    const { stub } = mockClient({ missingCount: { count: 3, error: null } })
    createClientMock.mockResolvedValue(stub)

    const result = await countCafesMissingLocation()

    expect(result).toEqual({ ok: true, data: { count: 3 } })
  })
})

describe('backfillCafeLocations', () => {
  it('admin でなければ FORBIDDEN を返し、geocodeAddress を呼ばない', async () => {
    const { stub } = mockClient({ role: 'user' })
    createClientMock.mockResolvedValue(stub)

    const result = await backfillCafeLocations()

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(geocodeAddressMock).not.toHaveBeenCalled()
  })

  it('対象カフェが0件なら何もせず結果を返す', async () => {
    const { stub } = mockClient({ missingCafes: [] })
    createClientMock.mockResolvedValue(stub)

    const result = await backfillCafeLocations()

    expect(result).toEqual({ ok: true, data: { processed: 0, updated: 0, skipped: [] } })
  })

  it('geocode成功した対象は location を更新し updated に数える', async () => {
    const { stub, spies } = mockClient({
      missingCafes: [
        { id: cafeAId, name: 'カフェA', prefecture: '東京都', city: '渋谷区', address: '神南1-1' },
      ],
    })
    createClientMock.mockResolvedValue(stub)
    geocodeAddressMock.mockResolvedValue({ ok: true, data: { lat: 35.6, lng: 139.7 } })

    const result = await backfillCafeLocations()

    expect(geocodeAddressMock).toHaveBeenCalledWith('東京都 渋谷区 神南1-1')
    expect(spies.update).toHaveBeenCalledWith({
      location: 'SRID=4326;POINT(139.7 35.6)',
    })
    expect(result).toEqual({ ok: true, data: { processed: 1, updated: 1, skipped: [] } })
  })

  it('geocodeが NOT_FOUND を返した対象は更新せず skipped に積む', async () => {
    const { stub, spies } = mockClient({
      missingCafes: [
        { id: cafeAId, name: 'カフェA', prefecture: '東京都', city: '渋谷区', address: null },
      ],
    })
    createClientMock.mockResolvedValue(stub)
    geocodeAddressMock.mockResolvedValue({ ok: false, error: 'NOT_FOUND' as const })

    const result = await backfillCafeLocations()

    expect(spies.update).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      data: {
        processed: 1,
        updated: 0,
        skipped: [{ cafeId: cafeAId, name: 'カフェA', reason: 'NOT_FOUND' }],
      },
    })
  })

  it('DB更新が失敗した対象は skipped に UPDATE_FAILED として積み、他の対象の処理は続ける', async () => {
    const { stub } = mockClient({
      missingCafes: [
        { id: cafeAId, name: 'カフェA', prefecture: '東京都', city: '渋谷区', address: null },
        { id: cafeBId, name: 'カフェB', prefecture: '東京都', city: '新宿区', address: null },
      ],
      updateError: { message: 'db down' },
    })
    createClientMock.mockResolvedValue(stub)
    geocodeAddressMock.mockResolvedValue({ ok: true, data: { lat: 35.6, lng: 139.7 } })

    const result = await backfillCafeLocations()

    expect(result).toEqual({
      ok: true,
      data: {
        processed: 2,
        updated: 0,
        skipped: [
          { cafeId: cafeAId, name: 'カフェA', reason: 'UPDATE_FAILED' },
          { cafeId: cafeBId, name: 'カフェB', reason: 'UPDATE_FAILED' },
        ],
      },
    })
  })
})
