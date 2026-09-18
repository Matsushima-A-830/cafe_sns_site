import { describe, expect, it } from 'vitest'
import {
  type BusinessHour,
  formatBusinessHour,
  getOpenState,
  jstDayOfWeek,
  orderBusinessHours,
} from './business-hours'

/** 平日 08:00-22:00 / 土日 09:00-21:00 / 火曜定休 */
function weekdayHours(): BusinessHour[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
    if (dayOfWeek === 2) {
      return { dayOfWeek, opensAt: null, closesAt: null, isClosed: true, notes: null }
    }
    const weekend = dayOfWeek === 0 || dayOfWeek === 6
    return {
      dayOfWeek,
      opensAt: weekend ? '09:00:00' : '08:00:00',
      closesAt: weekend ? '21:00:00' : '22:00:00',
      isClosed: false,
      notes: null,
    }
  })
}

function hour(dayOfWeek: number, opensAt: string, closesAt: string): BusinessHour {
  return { dayOfWeek, opensAt, closesAt, isClosed: false, notes: null }
}

describe('jstDayOfWeek', () => {
  it('JSTの暦日で曜日を返す', () => {
    // 2026-09-17T03:00Z = JST 12:00 木曜
    expect(jstDayOfWeek(new Date('2026-09-17T03:00:00Z'))).toBe(4)
  })

  it('UTCでは前日でもJSTの曜日を返す（0:00〜9:00の取り違え）', () => {
    // 2026-09-16T16:00Z = JST 2026-09-17 01:00 木曜（UTCでは水曜）
    expect(jstDayOfWeek(new Date('2026-09-16T16:00:00Z'))).toBe(4)
  })

  it('UTCでは翌日でもJSTの曜日を返す', () => {
    // 2026-09-17T23:00Z = JST 2026-09-18 08:00 金曜（UTCでは木曜）
    expect(jstDayOfWeek(new Date('2026-09-17T23:00:00Z'))).toBe(5)
  })
})

describe('getOpenState', () => {
  it('営業時間内なら open と閉店時刻を返す', () => {
    // JST 木曜 12:00
    const state = getOpenState(weekdayHours(), new Date('2026-09-17T03:00:00Z'))
    expect(state).toEqual({ status: 'open', until: '22:00' })
  })

  it('開店前は closed で次の開店時刻を返す', () => {
    // JST 木曜 07:00
    const state = getOpenState(weekdayHours(), new Date('2026-09-16T22:00:00Z'))
    expect(state).toEqual({ status: 'closed', nextOpen: { dayOfWeek: 4, at: '08:00' } })
  })

  it('閉店後は翌日の開店時刻を返す', () => {
    // JST 木曜 23:00 → 次は金曜 08:00
    const state = getOpenState(weekdayHours(), new Date('2026-09-17T14:00:00Z'))
    expect(state).toEqual({ status: 'closed', nextOpen: { dayOfWeek: 5, at: '08:00' } })
  })

  it('定休日はまたいで次の営業日を探す', () => {
    // JST 火曜 12:00（定休）→ 次は水曜 08:00
    const state = getOpenState(weekdayHours(), new Date('2026-09-15T03:00:00Z'))
    expect(state).toEqual({ status: 'closed', nextOpen: { dayOfWeek: 3, at: '08:00' } })
  })

  it('JST 0:00〜9:00 でも前日の営業時間を使わない', () => {
    // 2026-09-16T16:00Z = JST 木曜 01:00。UTC の曜日（水）で引くと
    // 「水曜 08:00-22:00 の営業時間外」ではなく別の答えになる
    const state = getOpenState(weekdayHours(), new Date('2026-09-16T16:00:00Z'))
    expect(state).toEqual({ status: 'closed', nextOpen: { dayOfWeek: 4, at: '08:00' } })
  })

  describe('深夜営業（opens_at > closes_at）', () => {
    // 毎日 22:00 〜 翌 02:00
    const overnight = [0, 1, 2, 3, 4, 5, 6].map((d) => hour(d, '22:00:00', '02:00:00'))

    it('日付が変わる前は open', () => {
      // JST 木曜 23:00
      expect(getOpenState(overnight, new Date('2026-09-17T14:00:00Z'))).toEqual({
        status: 'open',
        until: '02:00',
      })
    })

    it('日付が変わった後も前日の営業として open', () => {
      // JST 金曜 01:00。金曜の行（22:00開店）だけ見ると閉店扱いになる
      expect(getOpenState(overnight, new Date('2026-09-17T16:00:00Z'))).toEqual({
        status: 'open',
        until: '02:00',
      })
    })

    it('閉店直後は closed', () => {
      // JST 金曜 02:30
      expect(getOpenState(overnight, new Date('2026-09-17T17:30:00Z'))).toEqual({
        status: 'closed',
        nextOpen: { dayOfWeek: 5, at: '22:00' },
      })
    })

    it('前日が定休なら日またぎの営業は起きない', () => {
      // 木曜のみ定休、他は 22:00-02:00。JST 金曜 01:00
      const hours = overnight.map((h) =>
        h.dayOfWeek === 4 ? { ...h, isClosed: true, opensAt: null, closesAt: null } : h,
      )
      expect(getOpenState(hours, new Date('2026-09-17T16:00:00Z'))).toEqual({
        status: 'closed',
        nextOpen: { dayOfWeek: 5, at: '22:00' },
      })
    })
  })

  it('opens_at と closes_at が同じ行は終日営業として扱う', () => {
    const allDay = [0, 1, 2, 3, 4, 5, 6].map((d) => hour(d, '00:00:00', '00:00:00'))
    expect(getOpenState(allDay, new Date('2026-09-17T03:00:00Z'))).toEqual({
      status: 'open',
      until: null,
    })
  })

  it('営業時間が1件も無ければ unknown', () => {
    expect(getOpenState([], new Date('2026-09-17T03:00:00Z'))).toEqual({ status: 'unknown' })
  })

  it('全曜日が定休なら次の開店は無い', () => {
    const closed = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      opensAt: null,
      closesAt: null,
      isClosed: true,
      notes: null,
    }))
    expect(getOpenState(closed, new Date('2026-09-17T03:00:00Z'))).toEqual({
      status: 'closed',
      nextOpen: null,
    })
  })

  it('営業日が週1日のカフェは、その日の閉店後に来週の同じ曜日を返す', () => {
    // 木曜だけ営業。JST 木曜 23:00 → 次に開くのは来週の木曜 08:00
    const onlyThursday = [hour(4, '08:00:00', '22:00:00')]
    expect(getOpenState(onlyThursday, new Date('2026-09-17T14:00:00Z'))).toEqual({
      status: 'closed',
      nextOpen: { dayOfWeek: 4, at: '08:00' },
    })
  })

  it('今日の行が無い（登録漏れ）ときも次の営業日を探す', () => {
    // 木曜（4）の行だけ無い。JST 木曜 12:00
    const hours = weekdayHours().filter((h) => h.dayOfWeek !== 4)
    expect(getOpenState(hours, new Date('2026-09-17T03:00:00Z'))).toEqual({
      status: 'closed',
      nextOpen: { dayOfWeek: 5, at: '08:00' },
    })
  })
})

describe('orderBusinessHours', () => {
  it('日曜から土曜の順に7日分を埋める', () => {
    const ordered = orderBusinessHours([hour(3, '08:00:00', '22:00:00')])
    expect(ordered.map((h) => h.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(ordered[3]?.opensAt).toBe('08:00:00')
    // 未登録の曜日は「定休」ではなく「情報なし」。勝手に定休扱いにしない
    expect(ordered[0]).toEqual({
      dayOfWeek: 0,
      opensAt: null,
      closesAt: null,
      isClosed: false,
      notes: null,
    })
  })
})

describe('formatBusinessHour', () => {
  it('秒を落として時刻の範囲にする', () => {
    expect(formatBusinessHour(hour(1, '08:00:00', '22:00:00'))).toBe('08:00 - 22:00')
  })

  it('定休日は定休と出す', () => {
    expect(
      formatBusinessHour({
        dayOfWeek: 2,
        opensAt: null,
        closesAt: null,
        isClosed: true,
        notes: null,
      }),
    ).toBe('定休日')
  })

  it('深夜営業は翌日であることを示す', () => {
    expect(formatBusinessHour(hour(5, '22:00:00', '02:00:00'))).toBe('22:00 - 翌02:00')
  })

  it('終日営業は24時間営業と出す', () => {
    expect(formatBusinessHour(hour(5, '00:00:00', '00:00:00'))).toBe('24時間営業')
  })

  it('未登録の曜日は情報なしと出す', () => {
    expect(
      formatBusinessHour({
        dayOfWeek: 0,
        opensAt: null,
        closesAt: null,
        isClosed: false,
        notes: null,
      }),
    ).toBe('—')
  })
})
