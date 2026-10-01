// S_EXPLORE: 発見
// 詳細: docs/design/wireframes/browsing.md#s_explore発見
import type { Metadata } from 'next'
import Link from 'next/link'
import { DEFAULT_MAP_CENTER } from '@/app/(browsing)/map/page'
import { FeedTabs } from '@/components/features/feed/feed-tabs'
import { GuestHint } from '@/components/features/feed/guest-hint'
import { HomeSideNav } from '@/components/features/feed/home-side-nav'
import { NearbyLocationSync } from '@/components/features/feed/nearby-location-sync'
import { PostFeed } from '@/components/features/posts/post-feed'
import { resolveFeedOptions } from '@/lib/posts/feed'
import { getPostList, type PostListPage } from '@/lib/posts/post-list'
import { createClient } from '@/lib/supabase/server'
import { firstParam } from '@/lib/utils/search-params'
import { type FeedQuery, parseFeedQuery } from '@/lib/validators/feed'

// routing.md は ISR (60s) を想定していたが、ブロック関係の判定に閲覧者のセッションが
// 要るため SSR。投稿詳細と同じ経緯 — pending-items D23

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = {
  title: '発見',
  description: '気分やシーンのタグから、まだ知らないカフェの投稿を探す。',
}

const EMPTY_PAGE: PostListPage = { items: [], nextCursor: null }

export default async function ExplorePage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // デフォルト効果: 何も指定が無ければ「おすすめ」
  //   docs/product/mvp-scope.md 選択のパラドックス回避
  const tabParam = firstParam(params.tab)
  const query = parseFeedQuery({
    scope: tabParam === 'new' ? 'new' : tabParam === 'nearby' ? 'nearby' : 'recommended',
    tagSlug: firstParam(params.tag),
    areaCode: firstParam(params.area),
    lat: firstParam(params.lat),
    lng: firstParam(params.lng),
  })

  // 「近くのカフェ」タブで現在地未取得（初回SSR描画・Geolocation待ち）はフォールバック中心
  // （新宿駅）で取得する。NearbyLocationSync がクライアントで実座標に置き換える
  const usesFallbackCenter = query.scope === 'nearby' && query.lat === null && query.lng === null
  const effectiveQuery: FeedQuery = usesFallbackCenter
    ? { ...query, lat: DEFAULT_MAP_CENTER.lat, lng: DEFAULT_MAP_CENTER.lng }
    : query

  const resolved = await resolveFeedOptions(supabase, effectiveQuery, user?.id ?? null)
  const page = resolved ? await getPostList(supabase, resolved.options) : EMPTY_PAGE

  // タグ絞り込み中は、何で絞っているかと外し方を明示する
  const activeTag = resolved?.tag?.label ?? (query.tagSlug && !resolved ? query.tagSlug : null)
  // タブを切り替えても絞り込みは保つ。落とすと同じ条件のつもりで別の結果が出る
  const exploreHref = (tab: string, tagSlug: string | null) => {
    const next = new URLSearchParams({ tab })
    if (tagSlug) next.set('tag', tagSlug)
    if (query.areaCode) next.set('area', query.areaCode)
    return `/explore?${next.toString()}`
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8">
      <HomeSideNav current="explore" isAuthed={user != null} />

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <h1 className="text-2xl font-bold text-foreground">発見</h1>

        <FeedTabs
          label="発見の並び"
          currentKey={query.scope}
          tabs={[
            {
              key: 'recommended',
              label: 'おすすめ',
              href: exploreHref('recommended', query.tagSlug),
            },
            { key: 'new', label: '新着', href: exploreHref('new', query.tagSlug) },
            { key: 'nearby', label: '近くのカフェ', href: exploreHref('nearby', query.tagSlug) },
          ]}
        />

        {query.scope === 'nearby' && <NearbyLocationSync />}

        {usesFallbackCenter && (
          <p className="text-sm text-muted-foreground">
            現在地を取得中です。見つかるまでは新宿駅周辺のカフェを表示しています。
          </p>
        )}

        {activeTag && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-base text-foreground">
              <span className="font-bold">#{activeTag}</span> で絞り込み中
            </p>
            <Link
              href={exploreHref(query.scope, null)}
              className="text-sm text-link underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              絞り込みを解除
            </Link>
          </div>
        )}

        {!user && <GuestHint />}

        <PostFeed
          // タブ・絞り込みが変わったら追記済みの一覧を破棄する（S_HOME と同じ理由）。
          // lat/lng も含めるのは、フォールバック中心→実座標への置き換え（NearbyLocationSync）が
          // router.replace 経由でこのコンポーネントを再マウントさせ、initialPage を最新化するため
          key={`${query.scope}:${query.tagSlug}:${query.areaCode}:${effectiveQuery.lat}:${effectiveQuery.lng}`}
          initialPage={page}
          query={effectiveQuery}
          isAuthenticated={user != null}
          emptyMessage={
            activeTag
              ? `#${activeTag} の投稿はまだありません。別の気分から探してみましょう。`
              : query.scope === 'nearby'
                ? '近くに投稿がありません。エリアを変えて探してみましょう。'
                : 'まだ投稿がありません。'
          }
        />
      </div>
    </div>
  )
}
