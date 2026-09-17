/**
 * 営業時間（cafe_business_hours）の整形と「今営業中か」の判定。
 *
 * day_of_week・opens_at・closes_at はすべてカフェの現地時刻（JST）の壁時計。
 * Vercel のサーバーは UTC なので、曜日も時刻も必ず Asia/Tokyo で求める
 * （素朴に `new Date().getDay()` を使うと JST 0:00〜9:00 が前日扱いになる）
 *   supabase/migrations/20260906140000_create_cafe_business_hours.sql の列コメント
 */

export type BusinessHour = {
  /** 0=日曜〜6=土曜（JSTの暦日） */
  dayOfWeek: number
  /** 'HH:MM:SS'。定休日と未登録は null */
  opensAt: string | null
  closesAt: string | null
  isClosed: boolean
  notes: string | null
}

export type OpenState =
  /** until は閉店時刻 'HH:MM'。終日営業のときだけ null */
  | { status: 'open'; until: string | null }
  /** nextOpen は次に開く曜日と時刻。全曜日が定休・営業時間未登録なら null */
  | { status: 'closed'; nextOpen: { dayOfWeek: number; at: string } | null }
  /** 営業時間が1件も登録されていない */
  | { status: 'unknown' }

export const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

// getDay() はサーバーのタイムゾーンに従うため使えない。曜日と時刻を JST で取り出す
const jstParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function jstNow(now: Date): { dayOfWeek: number; minutes: number } {
  const parts = jstParts.formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  // hour12: false でも環境によって 24 時が返る（0時の表現）ため 24 を 0 に戻す
  const hour = Number(get('hour')) % 24
  return {
    dayOfWeek: WEEKDAY_INDEX[get('weekday')] ?? 0,
    minutes: hour * 60 + Number(get('minute')),
  }
}

/** JST の暦日における曜日（0=日曜〜6=土曜） */
export function jstDayOfWeek(now: Date): number {
  return jstNow(now).dayOfWeek
}

/** 'HH:MM:SS' → 分。パースできない値は null */
function toMinutes(time: string | null): number | null {
  if (!time) return null
  const match = /^(\d{2}):(\d{2})/.exec(time)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** 'HH:MM:SS' → 'HH:MM' */
function toClock(time: string): string {
  return time.slice(0, 5)
}

/** 定休でも未登録でもない＝開店/閉店時刻が揃っている行 */
type OpenHour = BusinessHour & { opensAt: string; closesAt: string }

function hasHours(hour: BusinessHour | undefined): hour is OpenHour {
  return !!hour && !hour.isClosed && hour.opensAt !== null && hour.closesAt !== null
}

/** 日曜〜土曜の7行に揃える。未登録の曜日は「定休」ではなく「情報なし」の行を置く */
export function orderBusinessHours(hours: BusinessHour[]): BusinessHour[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const found = hours.find((hour) => hour.dayOfWeek === dayOfWeek)
    return found ?? { dayOfWeek, opensAt: null, closesAt: null, isClosed: false, notes: null }
  })
}

/**
 * 「今営業中 / 閉店」。深夜営業（opens_at > closes_at）は前日の行が今日にはみ出すので、
 * 今日の行だけでなく前日の行も見る必要がある。
 * opens_at === closes_at は終日営業として扱う（DB は両者を区別できない）
 */
export function getOpenState(hours: BusinessHour[], now: Date): OpenState {
  if (hours.length === 0) return { status: 'unknown' }

  const { dayOfWeek, minutes } = jstNow(now)
  const byDay = (day: number) => hours.find((hour) => hour.dayOfWeek === ((day % 7) + 7) % 7)

  const today = byDay(dayOfWeek)
  if (hasHours(today)) {
    const opens = toMinutes(today.opensAt)
    const closes = toMinutes(today.closesAt)
    if (opens !== null && closes !== null) {
      if (opens === closes) return { status: 'open', until: null }
      if (opens < closes && minutes >= opens && minutes < closes) {
        return { status: 'open', until: toClock(today.closesAt) }
      }
      // 日またぎ。今日ぶんの開店以降はすべて営業中
      if (opens > closes && minutes >= opens) {
        return { status: 'open', until: toClock(today.closesAt) }
      }
    }
  }

  // 前日から続く深夜営業のはみ出し
  const yesterday = byDay(dayOfWeek - 1)
  if (hasHours(yesterday)) {
    const opens = toMinutes(yesterday.opensAt)
    const closes = toMinutes(yesterday.closesAt)
    if (opens !== null && closes !== null && opens > closes && minutes < closes) {
      return { status: 'open', until: toClock(yesterday.closesAt) }
    }
  }

  return { status: 'closed', nextOpen: findNextOpen(hours, dayOfWeek, minutes) }
}

/**
 * 今日の残り → 明日以降の順に、最初に開く時刻を探す。
 * 7日先（＝来週の同じ曜日）まで見るのは、営業日が週1日しか無いカフェで
 * その日の開店時刻を過ぎた場合に「次はいつ開くか」を失わないため
 */
function findNextOpen(
  hours: BusinessHour[],
  dayOfWeek: number,
  minutes: number,
): { dayOfWeek: number; at: string } | null {
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = (dayOfWeek + offset) % 7
    const hour = hours.find((entry) => entry.dayOfWeek === day)
    if (!hasHours(hour)) continue

    const opens = toMinutes(hour.opensAt)
    if (opens === null) continue
    // 今日だけは現在時刻より後の開店に限る（既に過ぎた開店時刻は次ではない）
    if (offset === 0 && opens <= minutes) continue

    return { dayOfWeek: day, at: toClock(hour.opensAt) }
  }
  return null
}

/** 営業時間表の1行ぶんの表示。'08:00 - 22:00' / '22:00 - 翌02:00' / '定休日' / '—' */
export function formatBusinessHour(hour: BusinessHour): string {
  if (hour.isClosed) return '定休日'
  if (!hour.opensAt || !hour.closesAt) return '—'

  const opens = toMinutes(hour.opensAt)
  const closes = toMinutes(hour.closesAt)
  if (opens === null || closes === null) return '—'
  if (opens === closes) return '24時間営業'

  const suffix = opens > closes ? '翌' : ''
  return `${toClock(hour.opensAt)} - ${suffix}${toClock(hour.closesAt)}`
}
