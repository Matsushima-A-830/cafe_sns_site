// S_OWNER_ANALYTICS: 投稿分析
// 詳細: docs/design/wireframes/owner.md#s_owner_analytics投稿分析 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { congestionLabel } from '@/lib/cafes/congestion'
import type { AnalyticsPeriodWeeks } from '@/lib/owner/analytics'
import { getCafeAnalytics } from '@/lib/owner/analytics'
import { changeTone, formatChangePct } from '@/lib/owner/dashboard'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { createClient } from '@/lib/supabase/server'
import { ExportCsvButton } from './export-csv-button'
import { TrendChart } from './trend-chart'

// middleware.ts の isOwnerArea が role='owner'|'admin' をゲートするが、cafeId が
// 呼び出し元本人のカフェかまでは見ていない。getCafeAnalytics 側で verified_owner_id を
// 検証し、他人のカフェなら notFound() に落とす（S_OWNER_DASHBOARD と同じ落とし穴1）

type PageProps = {
  params: Promise<{ cafeId: string }>
  searchParams: Promise<{ weeks?: string }>
}

export const metadata: Metadata = { title: '投稿分析' }

function KpiCard({
  label,
  count,
  changePct,
}: {
  label: string
  count: number
  changePct: number | null
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border-default bg-surface p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold text-foreground">{count}</dd>
      <dd className={`text-sm font-bold ${changeTone(changePct)}`}>{formatChangePct(changePct)}</dd>
    </div>
  )
}

// インライン style 禁止（CLAUDE.md）のため、12分率の Tailwind 幅クラスをテーブルで引く
const WIDTH_TWELFTHS = [
  'w-0',
  'w-1/12',
  'w-2/12',
  'w-3/12',
  'w-4/12',
  'w-5/12',
  'w-6/12',
  'w-7/12',
  'w-8/12',
  'w-9/12',
  'w-10/12',
  'w-11/12',
  'w-full',
] as const

function TagBar({ label, count, maxCount }: { label: string; count: number; maxCount: number }) {
  const twelfths = maxCount > 0 ? Math.round((count / maxCount) * 12) : 0
  const widthClass = WIDTH_TWELFTHS[twelfths] ?? 'w-full'
  return (
    <li className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-sm text-foreground">#{label}</span>
      <div className="h-2 flex-1 rounded-full bg-muted" aria-hidden="true">
        <div className={`h-2 rounded-full bg-primary ${widthClass}`} />
      </div>
      <span className="w-8 shrink-0 text-right text-sm text-muted-foreground">{count}</span>
    </li>
  )
}

function PosterAvatar({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null
  displayName: string
}) {
  const url = avatarUrl && isStoragePublicUrl(avatarUrl) ? avatarUrl : null
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground"
    >
      {displayName.slice(0, 1)}
    </span>
  )
}

export default async function OwnerAnalyticsPage({ params, searchParams }: PageProps) {
  const { cafeId } = await params
  const { weeks: weeksParam } = await searchParams
  const weeks: AnalyticsPeriodWeeks = weeksParam === '12' ? 12 : 4

  const supabase = await createClient()
  const analytics = await getCafeAnalytics(supabase, cafeId, weeks)
  if (!analytics) notFound()

  const maxTagCount = Math.max(1, ...analytics.tags.map((tag) => tag.count))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href={`/owner/${cafeId}`}
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{analytics.cafe.name} 投稿分析</h1>
      </div>

      <nav aria-label="期間" className="flex gap-2">
        {([4, 12] as const).map((option) => (
          <Link
            key={option}
            href={`/owner/${cafeId}/analytics?weeks=${option}`}
            aria-current={weeks === option ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-bold focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none ${
              weeks === option
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface text-foreground hover:bg-muted'
            }`}
          >
            直近{option}週間
          </Link>
        ))}
      </nav>

      <dl className="grid grid-cols-3 gap-2">
        <KpiCard
          label="投稿数"
          count={analytics.posts.count}
          changePct={analytics.posts.changePct}
        />
        <KpiCard
          label="いいね"
          count={analytics.likes.count}
          changePct={analytics.likes.changePct}
        />
        <KpiCard
          label="保存"
          count={analytics.bookmarks.count}
          changePct={analytics.bookmarks.changePct}
        />
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-foreground">推移</h2>
        <TrendChart trend={analytics.trend} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-foreground">よく使われるタグ</h2>
        {analytics.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">この期間のタグ付き投稿はまだありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {analytics.tags.map((tag) => (
              <TagBar key={tag.tagId} label={tag.label} count={tag.count} maxCount={maxTagCount} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-foreground">投稿者トップ</h2>
        {analytics.topPosters.length === 0 ? (
          <p className="text-sm text-muted-foreground">この期間の投稿者はまだいません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {analytics.topPosters.map((poster) => (
              <li key={poster.userId} className="flex items-center gap-3">
                <PosterAvatar avatarUrl={poster.avatarUrl} displayName={poster.displayName} />
                <span className="flex-1 text-sm text-foreground">{poster.displayName}</span>
                <span className="text-sm text-muted-foreground">{poster.postCount}投稿</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-foreground">混雑度平均（曜日別）</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-2 font-normal">
                  曜日
                </th>
                <th scope="col" className="py-1 pr-2 font-normal">
                  平均
                </th>
                <th scope="col" className="py-1 font-normal">
                  サンプル数
                </th>
              </tr>
            </thead>
            <tbody>
              {analytics.weekdayCongestion.map((day) => (
                <tr key={day.dayOfWeek} className="border-t border-border-default">
                  <th scope="row" className="py-1 pr-2 font-bold text-foreground">
                    {day.label}
                  </th>
                  <td className="py-1 pr-2 text-foreground">
                    {day.levelAvg !== null ? (
                      <>
                        {day.levelAvg.toFixed(1)} / 5
                        <span className="ml-2 text-muted-foreground">
                          {congestionLabel(day.levelAvg)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">データなし</span>
                    )}
                  </td>
                  <td className="py-1 text-muted-foreground">{day.sampleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ExportCsvButton cafeId={cafeId} weeks={weeks} />
    </div>
  )
}
