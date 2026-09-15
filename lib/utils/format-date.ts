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
