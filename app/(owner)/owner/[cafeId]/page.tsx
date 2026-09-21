// S_OWNER_DASHBOARD: カフェ経営者ダッシュボード
// 詳細: docs/design/wireframes/owner.md#s_owner_dashboard経営者ダッシュボード / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PostCard } from '@/components/features/posts/post-card'
import { congestionLabel } from '@/lib/cafes/congestion'
import { formatChangePct, getOwnerDashboard, type WeeklyStat } from '@/lib/owner/dashboard'
import { createClient } from '@/lib/supabase/server'
import { formatPostDate } from '@/lib/utils/format-date'

// middleware.ts の isOwnerArea が role='owner'|'admin' をゲートするが、cafeId が
// 呼び出し元本人のカフェかまでは見ていない。getOwnerDashboard 側で verified_owner_id を
// 検証し、他人のカフェなら notFound() に落とす（handoff の落とし穴1）

type PageProps = { params: Promise<{ cafeId: string }> }

export const metadata: Metadata = { title: 'ダッシュボード' }

/** 未実装の画面へのリンクは張らない。ワイヤーの5項目のうち現時点で遷移先があるものは無い */
const MENU_ITEMS = [
  '店舗情報を編集',
  '投稿分析を見る',
  'ユーザー投稿一覧',
  '公式投稿を作成',
  '認証情報',
] as const

function changeTone(pct: number | null): string {
  if (pct === null || pct === 0) return 'text-muted-foreground'
  return pct > 0 ? 'text-success' : 'text-danger'
}

function StatCard({ label, stat }: { label: string; stat: WeeklyStat }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border-default bg-surface p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold text-foreground">{stat.count}</dd>
      <dd className={`text-sm font-bold ${changeTone(stat.changePct)}`}>
        {formatChangePct(stat.changePct)}
      </dd>
    </div>
  )
}

function CongestionCard({ levelAvg }: { levelAvg: number | null }) {
  const label = congestionLabel(levelAvg)
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border-default bg-surface p-4">
      <dt className="text-sm text-muted-foreground">混雑度平均</dt>
      <dd className="text-2xl font-bold text-foreground">
        {levelAvg !== null ? levelAvg.toFixed(1) : '—'}
        <span className="text-sm font-normal text-muted-foreground">/5</span>
      </dd>
      <dd className="text-sm text-muted-foreground">{label ?? 'データなし'}</dd>
    </div>
  )
}

export default async function OwnerDashboardPage({ params }: PageProps) {
  const { cafeId } = await params
  const supabase = await createClient()
  const dashboard = await getOwnerDashboard(supabase, cafeId)
  if (!dashboard) notFound()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href={`/cafes/${cafeId}`}
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{dashboard.cafe.name} ダッシュボード</h1>
        {dashboard.cafe.verifiedSince && (
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
            ✓ 公式認証済み
            <span className="font-normal">
              since {formatPostDate(dashboard.cafe.verifiedSince)}
            </span>
          </span>
        )}
      </header>

      {/* モバイルは「サマリー→メニュー→最新の投稿」（ワイヤー準拠）を order で組む。
          PC は行・列を明示指定する — auto-placement に order だけで任せると、サマリーの
          col-span-2 が右端1列を残したまま次の行へ折り返し、メニューがそこを埋められず
          1行分下にずれる（sparse packing は隙間を後から埋めない） */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:items-start">
        <section className="order-1 flex flex-col gap-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <h2 className="text-lg font-bold text-foreground">今週のサマリー</h2>
          <dl className="grid grid-cols-3 gap-2 lg:grid-cols-4">
            <StatCard label="投稿数" stat={dashboard.posts} />
            <StatCard label="いいね" stat={dashboard.likes} />
            <StatCard label="保存" stat={dashboard.bookmarks} />
            {/* 混雑度はPCワイヤーの4枚目カードのみ。モバイルワイヤーは3枚構成なので隠す */}
            <div className="hidden lg:col-span-1 lg:block">
              <CongestionCard levelAvg={dashboard.congestion.levelAvg} />
            </div>
          </dl>
        </section>

        <aside className="order-2 flex flex-col gap-4 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-2">
          <h2 className="text-lg font-bold text-foreground">メニュー</h2>
          <ul className="flex flex-col gap-2">
            {MENU_ITEMS.map((label) => (
              <li
                key={label}
                className="flex items-center justify-between rounded-lg border border-border-default bg-surface px-4 py-3 text-sm text-muted-foreground"
              >
                {label}
                <span className="rounded-full bg-muted px-2 py-1 text-xs">準備中</span>
              </li>
            ))}
          </ul>
        </aside>

        <section className="order-3 flex flex-col gap-4 lg:col-span-2 lg:col-start-1 lg:row-start-2">
          <h2 className="text-lg font-bold text-foreground">最新の投稿</h2>
          {dashboard.latestPosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだ投稿がありません。</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {dashboard.latestPosts.map((post) => (
                <PostCard key={post.id} post={post} isAuthenticated />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
