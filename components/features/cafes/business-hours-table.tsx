import {
  type BusinessHour,
  DAY_LABELS,
  formatBusinessHour,
  jstDayOfWeek,
  orderBusinessHours,
} from '@/lib/cafes/business-hours'

/**
 * 営業時間の曜日×時刻の対応表。<table> で組むのは div の羅列だとスクリーンリーダーで
 * 「どの曜日の時刻か」の対応が失われるため
 *   docs/design/wireframes/browsing.md #S_CAFE_DETAIL
 */
export function BusinessHoursTable({ hours, now }: { hours: BusinessHour[]; now: Date }) {
  if (hours.length === 0) {
    return <p className="text-sm text-muted-foreground">営業時間は登録されていません。</p>
  }

  const today = jstDayOfWeek(now)

  return (
    <table className="w-full border-collapse text-base">
      <caption className="sr-only">曜日ごとの営業時間（日本時間）</caption>
      <tbody>
        {orderBusinessHours(hours).map((hour) => {
          const isToday = hour.dayOfWeek === today
          return (
            <tr key={hour.dayOfWeek} className="border-b border-border-default last:border-b-0">
              <th
                scope="row"
                className={`py-2 pr-4 text-left font-normal ${
                  isToday ? 'font-bold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {DAY_LABELS[hour.dayOfWeek]}
                {isToday && <span className="sr-only">（今日）</span>}
              </th>
              <td className="py-2 text-foreground">
                <span className={`tabular-nums ${isToday ? 'font-bold' : ''}`}>
                  {formatBusinessHour(hour)}
                </span>
                {hour.notes && (
                  <span className="ml-2 text-sm text-muted-foreground">{hour.notes}</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
