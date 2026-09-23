import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateCafeBusinessHours } from './cafe-business-hours'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

const userId = '99999999-9999-4999-8999-999999999999'
const cafeId = '11111111-1111-4111-8111-111111111111'

const closedHour = (dayOfWeek: number) => ({ dayOfWeek, isClosed: true })
const openHour = (dayOfWeek: number) => ({
  dayOfWeek,
  isClosed: false,
  opensAt: '08:00',
  closesAt: '22:00',
})

const validInput = {
  cafeId,
  hours: Array.from({ length: 7 }, (_, dayOfWeek) =>
    dayOfWeek === 0 ? closedHour(dayOfWeek) : openHour(dayOfWeek),
  ),
}

function buildSupabaseStub(
  options: { user?: { id: string } | null; upsertResult?: { error?: unknown } } = {},
) {
  const user = 'user' in options ? options.user : { id: userId }
  const upsertResult = options.upsertResult ?? { error: null }

  const businessHoursTable = { upsert: vi.fn().mockResolvedValue(upsertResult) }
  const from = vi.fn(() => businessHoursTable)

  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
      from,
    },
    spies: { upsert: businessHoursTable.upsert },
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('updateCafeBusinessHours', () => {
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await updateCafeBusinessHours({ cafeId, hours: [] })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('定休日でないのに時刻が無い行は INVALID_INPUT を返す', async () => {
    const result = await updateCafeBusinessHours({
      cafeId,
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, isClosed: false })),
    })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
  })

  it('未ログインなら UNAUTHENTICATED を返す', async () => {
    const { stub } = buildSupabaseStub({ user: null })
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafeBusinessHours(validInput)

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
  })

  it('成功時は7曜日ぶんを cafe_id,day_of_week で upsert する', async () => {
    const { stub, spies } = buildSupabaseStub()
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafeBusinessHours(validInput)

    expect(result).toEqual({ ok: true, data: null })
    expect(spies.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          cafe_id: cafeId,
          day_of_week: 0,
          is_closed: true,
          opens_at: null,
        }),
        expect.objectContaining({
          cafe_id: cafeId,
          day_of_week: 1,
          is_closed: false,
          opens_at: '08:00',
          closes_at: '22:00',
        }),
      ]),
      { onConflict: 'cafe_id,day_of_week' },
    )
  })

  it('RLS(42501) は FORBIDDEN を返す（他人のカフェ / suspended）', async () => {
    const { stub } = buildSupabaseStub({
      upsertResult: { error: { code: '42501', message: 'permission denied' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafeBusinessHours(validInput)

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
  })

  it('想定外のエラーは INTERNAL_ERROR を返す', async () => {
    const { stub } = buildSupabaseStub({
      upsertResult: { error: { code: 'XXXXX', message: 'boom' } },
    })
    createClientMock.mockResolvedValue(stub)

    const result = await updateCafeBusinessHours(validInput)

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' })
  })
})
