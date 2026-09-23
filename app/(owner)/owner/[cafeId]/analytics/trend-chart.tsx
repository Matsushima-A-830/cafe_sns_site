'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from '@/lib/owner/analytics'
import { formatPostDate } from '@/lib/utils/format-date'

/**
 * S_OWNER_ANALYTICS の「推移」折れ線グラフ。色だけに依存しないよう、Tooltip で
 * 数値ラベルを必ず併記する（CLAUDE.md アクセシビリティ）
 */
export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const data = trend.map((point) => ({
    label: formatPostDate(point.weekStart),
    投稿数: point.posts,
    いいね: point.likes,
    保存: point.bookmarks,
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="投稿数" stroke="var(--color-brown-700)" strokeWidth={2} />
          <Line type="monotone" dataKey="いいね" stroke="var(--color-brown-400)" strokeWidth={2} />
          <Line type="monotone" dataKey="保存" stroke="var(--color-brown-200)" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
