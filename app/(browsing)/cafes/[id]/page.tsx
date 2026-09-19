// S_CAFE_DETAIL: カフェ詳細
// 詳細: docs/design/wireframes/browsing.md#s_cafe_detailカフェ詳細 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { BusinessHoursTable } from '@/components/features/cafes/business-hours-table'
import { CafeListButtons } from '@/components/features/cafes/cafe-list-buttons'
import { CongestionSection } from '@/components/features/cafes/congestion-section'
import { OpenStateBadge } from '@/components/features/cafes/open-state-badge'
import { PostFeed } from '@/components/features/posts/post-feed'
import { jstDayOfWeek } from '@/lib/cafes/business-hours'
import { type CafeDetail, getCafeDetail, getCafePostCount } from '@/lib/cafes/cafe-detail'
import { getCafeCongestion } from '@/lib/cafes/congestion'
import { getCafeListMembership } from '@/lib/cafes/user-cafe-lists'
import { getPostList } from '@/lib/posts/post-list'
import { createClient } from '@/lib/supabase/server'
import { safeHttpUrl } from '@/lib/utils/safe-url'
import type { FeedQuery } from '@/lib/validators/feed'

// routing.md は ISR (300s) を想定していたが、投稿グリッドが posts_select を通るため
// 閲覧者のセッションが要る（anon ではブロック関係が効かない）。経緯は pending-items D23

type PageProps = { params: Promise<{ id: string }> }

/** Server Component 内の複数箇所から同じクライアントを使う（cookies() の読み直しを避ける） */
const getSupabase = cache(async () => createClient())

/**
 * 404 にする条件をここに集約する。存在しないID・closed・hidden はすべて
 * cafes_select_active_* が0件にするので、アプリ層で status を見る必要はない。
 * generateMetadata と本体からの2回の呼び出しは cache() で1回にまとめる
 */
const loadCafe = cache(async (id: string): Promise<CafeDetail | null> => {
  const supabase = await getSupabase()
  return getCafeDetail(supabase, id)
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const cafe = await loadCafe(id)
  if (!cafe) return { title: 'カフェが見つかりません' }

  const description =
    cafe.description ?? `${cafe.areaLabel ?? ''}のカフェ「${cafe.name}」の投稿・営業時間・混雑度`

  // ルートの template が「 | カフェSNS」を付ける
  return {
    title: cafe.name,
    description,
    openGraph: {
      title: cafe.name,
      description,
      images: cafe.heroImageUrl ? [cafe.heroImageUrl] : undefined,
    },
  }
}

function CafeHero({ cafe }: { cafe: CafeDetail }) {
  if (!cafe.heroImageUrl) {
    return (
      <div
        aria-hidden="true"
        className="flex h-48 w-full items-center justify-center rounded-lg bg-muted text-base text-muted-foreground md:h-64"
      >
        写真はまだありません
      </div>
    )
  }

  return (
    <Image
      src={cafe.heroImageUrl}
      // 投稿写真の流用で alt の入力導線が無い（pending-items D22）。装飾扱いにする
      alt=""
      width={1200}
      height={480}
      priority
      className="h-48 w-full rounded-lg object-cover md:h-64"
    />
  )
}

function CafeInfoList({ cafe }: { cafe: CafeDetail }) {
  const website = safeHttpUrl(cafe.website)
  const items = [
    cafe.address ? { label: '住所', value: <span>{cafe.address}</span> } : null,
    cafe.phone
      ? {
          label: '電話',
          value: (
            <a
              href={`tel:${cafe.phone}`}
              className="text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus"
            >
              {cafe.phone}
            </a>
          ),
        }
      : null,
    website
      ? {
          label: 'Web',
          value: (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus"
            >
              {website}
            </a>
          ),
        }
      : null,
  ].filter((item) => item !== null)

  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">基本情報</h2>
      <dl className="flex flex-col gap-2 text-base text-foreground">
        {items.map((item) => (
          <div key={item.label} className="flex gap-4">
            <dt className="w-16 shrink-0 text-sm text-muted-foreground">{item.label}</dt>
            <dd className="min-w-0">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default async function CafeDetailPage({ params }: PageProps) {
  const { id } = await params
  const cafe = await loadCafe(id)
  if (!cafe) notFound()

  const supabase = await getSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 表示に要る残りは往復を直列にしない（CLAUDE.md パフォーマンス「N+1回避」）
  const [postCount, congestion, page, membership] = await Promise.all([
    getCafePostCount(supabase, cafe.id),
    getCafeCongestion(supabase, cafe.id),
    getPostList(supabase, { cafeId: cafe.id, viewerId: user?.id ?? null }),
    // 未ログインではリスト行を1件も読めないので問い合わせ自体を省く
    user
      ? getCafeListMembership(supabase, cafe.id)
      : Promise.resolve({ favorite: false, want_to_go: false }),
  ])

  // 営業時間・混雑度の判定はどちらも同じ「今」を基準にする
  const now = new Date()
  const today = jstDayOfWeek(now)

  // 地図・「徒歩3分」（座標未収集）・「オーナーから」（幹C本体）・通報（reports）は
  // 元テーブル・データが未整備のため出していない — pending-items D30
  const query: FeedQuery = {
    scope: 'new',
    tagSlug: null,
    areaCode: null,
    authorUsername: null,
    cafeId: cafe.id,
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-4">
        <CafeHero cafe={cafe} />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{cafe.name}</h1>
            {cafe.isVerified && (
              <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
                ✓ 公式
              </span>
            )}
            <OpenStateBadge hours={cafe.businessHours} now={now} today={today} />
          </div>

          <p className="text-sm text-muted-foreground">
            {cafe.areaLabel && <span>{cafe.areaLabel}</span>}
            <span className="ml-2">投稿 {postCount}件</span>
          </p>

          {cafe.description && (
            <p className="max-w-prose text-base break-words whitespace-pre-wrap text-foreground">
              {cafe.description}
            </p>
          )}
        </div>

        {/* membership を key に混ぜない。トグルのたびに router.refresh() で値が変わり、
            押した直後にコンポーネントごと作り直されてフォーカスが body に落ち、
            aria-live の読み上げも描画前に消える。サーバー値とのズレは
            各ボタンが自分の楽観更新で吸収している */}
        <CafeListButtons
          key={cafe.id}
          cafeId={cafe.id}
          membership={membership}
          isAuthenticated={user !== null}
        />
      </header>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3 lg:items-start">
        {/* PC では投稿を主役にし、営業時間・混雑度・連絡先を右カラムに寄せる（ワイヤー PC 版） */}
        <section className="flex flex-col gap-4 lg:col-span-2">
          <h2 className="text-lg font-bold text-foreground">投稿</h2>
          <PostFeed
            initialPage={page}
            query={query}
            isAuthenticated={user != null}
            emptyMessage={`${cafe.name}の投稿はまだありません。最初の1件を投稿してみましょう。`}
          />
        </section>

        <aside className="flex flex-col gap-8 lg:col-span-1">
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-foreground">営業時間</h2>
            <BusinessHoursTable hours={cafe.businessHours} now={now} />
          </section>

          <CongestionSection
            cafeId={cafe.id}
            initialSummary={congestion}
            isAuthenticated={user !== null}
          />

          <CafeInfoList cafe={cafe} />
        </aside>
      </div>
    </div>
  )
}
