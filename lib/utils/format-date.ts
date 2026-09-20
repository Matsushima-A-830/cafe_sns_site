/**
 * 投稿日の表示。ISR で静的生成された HTML が閲覧者のタイムゾーンに依らず同じになるよう、
 * 表示は日本時間に固定する（サーバのタイムゾーン設定にも左右されない）
 */
const postDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

export function formatPostDate(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return postDateFormatter.format(date)
}

// numeric: 'always' にして「一昨日」のような口語表現を避け、ワイヤーの「1日前」に揃える
const relativeTimeFormatter = new Intl.RelativeTimeFormat('ja-JP', { numeric: 'always' })

const RELATIVE_TIME_UNITS: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] =
  [
    { limit: 60, divisor: 1, unit: 'second' },
    { limit: 60 * 60, divisor: 60, unit: 'minute' },
    { limit: 60 * 60 * 24, divisor: 60 * 60, unit: 'hour' },
    { limit: 60 * 60 * 24 * 30, divisor: 60 * 60 * 24, unit: 'day' },
    { limit: 60 * 60 * 24 * 365, divisor: 60 * 60 * 24 * 30, unit: 'month' },
  ]

/**
 * 通知一覧（S_NOTIFICATIONS）向けの相対時刻表示（「2分前」「1時間前」等）。
 * SSR/CSR で結果が変わりうる（now を跨ぐ）が、通知は「見た瞬間の新しさ」が主目的で
 * 投稿日と違い日付固定にする必要が薄いため許容する
 */
export function formatRelativeTime(isoString: string, now: Date = new Date()): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''

  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const absSeconds = Math.abs(diffSeconds)

  for (const { limit, divisor, unit } of RELATIVE_TIME_UNITS) {
    if (absSeconds < limit)
      return relativeTimeFormatter.format(Math.round(diffSeconds / divisor), unit)
  }
  return relativeTimeFormatter.format(Math.round(diffSeconds / (60 * 60 * 24 * 365)), 'year')
}
