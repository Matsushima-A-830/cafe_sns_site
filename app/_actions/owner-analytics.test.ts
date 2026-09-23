import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportCafeAnalyticsCsv } from './owner-analytics'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

const cafeId = '22222222-2222-4222-8222-222222222222'

afterEach(() => {
  vi.clearAllMocks()
})

describe('exportCafeAnalyticsCsv', () => {
  it('cafeId が UUID でなければ INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await exportCafeAnalyticsCsv({ cafeId: 'not-a-uuid', weeks: 4 })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('weeks が 4/12 以外なら INVALID_INPUT を返す', async () => {
    const result = await exportCafeAnalyticsCsv({ cafeId, weeks: 8 })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('cafeId が無い入力は INVALID_INPUT を返す', async () => {
    const result = await exportCafeAnalyticsCsv({ weeks: 4 })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
