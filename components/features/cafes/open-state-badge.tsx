import { type BusinessHour, DAY_LABELS, getOpenState } from '@/lib/cafes/business-hours'

/**
 * 「営業中 / 準備中」。判定は JST の壁時計で行い、深夜営業（22:00〜翌02:00）は
 * 前日の行が今日にはみ出す — lib/cafes/business-hours.ts
 */
export function OpenStateBadge({
  hours,
  now,
  today,
}: {
  hours: BusinessHour[]
  now: Date
  /** 「今日は何曜日か」。次の開店が今日かどうかの言い分けに使う */
  today: number
}) {
  const state = getOpenState(hours, now)
  if (state.status === 'unknown') return null

  if (state.status === 'open') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-success px-3 py-1 text-sm font-bold text-success-foreground">
        営業中
        {state.until && <span className="font-normal">{state.until} まで</span>}
      </span>
    )
  }

  const next = state.nextOpen
  const nextLabel = next
    ? `${next.dayOfWeek === today ? '本日' : `${DAY_LABELS[next.dayOfWeek]}曜`} ${next.at} から`
    : null

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground">
      準備中
      {nextLabel && <span className="font-normal">{nextLabel}</span>}
    </span>
  )
}
