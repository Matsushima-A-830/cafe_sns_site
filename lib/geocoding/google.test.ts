import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeAddress } from './google'

// 'server-only' はNextのビルド時に特別扱いされる薄いガードで、vitestではただ throw するだけ
vi.mock('server-only', () => ({}))

const { serverEnvMock } = vi.hoisted(() => ({
  serverEnvMock: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'test-key' },
}))

vi.mock('@/lib/env.server', () => ({ serverEnv: serverEnvMock }))

const fetchMock = vi.fn()

afterEach(() => {
  vi.clearAllMocks()
  serverEnvMock.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'test-key'
  vi.unstubAllGlobals()
})

function mockFetchResponse(body: unknown, ok = true) {
  fetchMock.mockResolvedValue({ ok, json: () => Promise.resolve(body) })
  vi.stubGlobal('fetch', fetchMock)
}

describe('geocodeAddress', () => {
  it('APIキー未設定なら EXTERNAL_SERVICE_ERROR を返し、fetch を呼ばない', async () => {
    serverEnvMock.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = ''
    vi.stubGlobal('fetch', fetchMock)

    const result = await geocodeAddress('東京都渋谷区')

    expect(result).toEqual({ ok: false, error: 'EXTERNAL_SERVICE_ERROR' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('status=OK なら座標を返す', async () => {
    mockFetchResponse({
      status: 'OK',
      results: [{ geometry: { location: { lat: 35.6, lng: 139.7 } } }],
    })

    const result = await geocodeAddress('東京都渋谷区')

    expect(result).toEqual({ ok: true, data: { lat: 35.6, lng: 139.7 } })
  })

  it('status=ZERO_RESULTS なら NOT_FOUND を返す', async () => {
    mockFetchResponse({ status: 'ZERO_RESULTS', results: [] })

    const result = await geocodeAddress('存在しない住所')

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' })
  })

  it('status=OVER_QUERY_LIMIT 等の異常時は EXTERNAL_SERVICE_ERROR を返す', async () => {
    mockFetchResponse({ status: 'OVER_QUERY_LIMIT', results: [] })

    const result = await geocodeAddress('東京都渋谷区')

    expect(result).toEqual({ ok: false, error: 'EXTERNAL_SERVICE_ERROR' })
  })

  it('HTTPレスポンスが失敗（ok=false）なら EXTERNAL_SERVICE_ERROR を返す', async () => {
    mockFetchResponse({}, false)

    const result = await geocodeAddress('東京都渋谷区')

    expect(result).toEqual({ ok: false, error: 'EXTERNAL_SERVICE_ERROR' })
  })
})
