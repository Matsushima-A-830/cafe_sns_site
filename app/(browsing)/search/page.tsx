// S_SEARCH: タグ検索
// 詳細: docs/design/wireframes/browsing.md#s_searchタグ検索 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { HomeSideNav } from '@/components/features/feed/home-side-nav'
import { SearchResultFeed } from '@/components/features/search/search-result-feed'
import { Input } from '@/components/ui/input'
import { getPostList, type PostListPage } from '@/lib/posts/post-list'
import {
  type AreaOption,
  FREQUENT_TAG_LIMIT,
  type FrequentTag,
  getAreaOptions,
  getFrequentTags,
  getNearbyAreaSuggestions,
  getRelatedTagSuggestions,
  getTagOptions,
  resolveSearchOptions,
} from '@/lib/posts/search'
import { createClient } from '@/lib/supabase/server'
import { firstParam } from '@/lib/utils/search-params'
import { parseSearchQuery, type SearchQuery } from '@/lib/validators/search'

// フィルタ・0件時のブロック関係判定に閲覧者のセッションが要るため SSR（explore/home と同じ経緯）
//   docs/architecture/routing.md / pending-items D23

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = {
  title: 'タグ検索',
  description: 'エリア・雰囲気・利用機会やキーワードから、気になるカフェの投稿を探す。',
}

const EMPTY_PAGE: PostListPage = { items: [], nextCursor: null }

/** 検索フォームの現在値を保ったまま1項目だけ変えたリンクを作る（よく使うタグチップ用） */
function searchHref(query: SearchQuery, overrides: Partial<SearchQuery>): string {
  const merged = { ...query, ...overrides }
  const params = new URLSearchParams()
  if (merged.keyword) params.set('q', merged.keyword)
  if (merged.areaCode) params.set('area', merged.areaCode)
  if (merged.moodSlug) params.set('mood', merged.moodSlug)
  if (merged.occasionSlug) params.set('occasion', merged.occasionSlug)
  const qs = params.toString()
  return qs ? `/search?${qs}` : '/search'
}

function frequentTagHref(query: SearchQuery, tag: FrequentTag): string {
  return tag.category === 'mood'
    ? searchHref(query, { moodSlug: tag.slug })
    : searchHref(query, { occasionSlug: tag.slug })
}

/** 「よく使うタグ」の全件表示リンク。searchHref は tagsExpanded を持たないので別途組み立てる */
function expandTagsHref(query: SearchQuery): string {
  const href = searchHref(query, {})
  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}tagsExpanded=1`
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const query = parseSearchQuery({
    keyword: firstParam(params.q),
    areaCode: firstParam(params.area),
    moodSlug: firstParam(params.mood),
    occasionSlug: firstParam(params.occasion),
  })
  const tagsExpanded = firstParam(params.tagsExpanded) === '1'

  const [areaOptions, moodOptions, occasionOptions, frequentTags, resolved] = await Promise.all([
    getAreaOptions(supabase),
    getTagOptions(supabase, 'mood'),
    getTagOptions(supabase, 'occasion'),
    getFrequentTags(supabase, tagsExpanded ? 100 : FREQUENT_TAG_LIMIT),
    resolveSearchOptions(supabase, query, user?.id ?? null),
  ])

  const page = resolved ? await getPostList(supabase, resolved.options) : EMPTY_PAGE
  const isEmpty = page.items.length === 0

  const excludeTagIds = [resolved?.moodTag?.id, resolved?.occasionTag?.id].filter(
    (id): id is string => id != null,
  )
  const [relatedTags, nearbyAreas] = isEmpty
    ? await Promise.all([
        getRelatedTagSuggestions(supabase, excludeTagIds),
        getNearbyAreaSuggestions(supabase, query.areaCode),
      ])
    : [[], [] as AreaOption[]]

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8">
      <HomeSideNav current="search" isAuthed={user != null} />

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <h1 className="text-2xl font-bold text-foreground">検索</h1>

        <form
          // クエリが変わったら input/select を作り直す。key が無いと Link 遷移では
          // 同じ DOM 要素が再利用され、defaultValue が新しい値に更新されない
          key={`filter:${query.keyword}:${query.areaCode}:${query.moodSlug}:${query.occasionSlug}`}
          method="GET"
          action="/search"
          className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface p-6"
        >
          <div className="flex flex-col gap-2">
            <label htmlFor="search-keyword" className="text-sm font-medium text-foreground">
              検索キーワード
            </label>
            <Input
              id="search-keyword"
              type="text"
              name="q"
              defaultValue={query.keyword ?? ''}
              placeholder="お店の名前や気になる言葉"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="search-area" className="text-sm font-medium text-foreground">
                エリア
              </label>
              <select
                id="search-area"
                name="area"
                defaultValue={query.areaCode ?? ''}
                className="h-10 w-full rounded-md border border-border-input bg-input px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring-focus focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">指定しない</option>
                {areaOptions.map((area) => (
                  <option key={area.code} value={area.code}>
                    {area.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="search-mood" className="text-sm font-medium text-foreground">
                雰囲気
              </label>
              <select
                id="search-mood"
                name="mood"
                defaultValue={query.moodSlug ?? ''}
                className="h-10 w-full rounded-md border border-border-input bg-input px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring-focus focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">指定しない</option>
                {moodOptions.map((tag) => (
                  <option key={tag.id} value={tag.slug}>
                    {tag.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="search-occasion" className="text-sm font-medium text-foreground">
                利用機会
              </label>
              <select
                id="search-occasion"
                name="occasion"
                defaultValue={query.occasionSlug ?? ''}
                className="h-10 w-full rounded-md border border-border-input bg-input px-3 py-2 text-base text-foreground outline-none focus-visible:border-ring-focus focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">指定しない</option>
                {occasionOptions.map((tag) => (
                  <option key={tag.id} value={tag.slug}>
                    {tag.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {frequentTags.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">よく使うタグ</p>
              <ul className="flex flex-wrap gap-2">
                {frequentTags.map((tag) => (
                  <li key={tag.id}>
                    <Link
                      href={frequentTagHref(query, tag)}
                      className="inline-block rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                    >
                      #{tag.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {!tagsExpanded && (
                <Link
                  href={expandTagsHref(query)}
                  className="text-sm text-link underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                >
                  もっと見る
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              検索する
            </button>
          </div>
        </form>

        {isEmpty ? (
          <div className="flex flex-col gap-6 rounded-lg border border-border-default bg-surface p-6">
            <p className="text-base text-foreground">該当する投稿が見つかりませんでした</p>

            {relatedTags.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground">もしかして</p>
                <ul className="flex flex-wrap gap-2">
                  {relatedTags.map((tag) => (
                    <li key={tag.id}>
                      <Link
                        href={frequentTagHref(query, tag)}
                        className="inline-block rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                      >
                        #{tag.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {nearbyAreas.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground">エリアを広げる</p>
                <ul className="flex flex-wrap gap-2">
                  {nearbyAreas.map((area) => (
                    <li key={area.code}>
                      <Link
                        href={searchHref(query, { areaCode: area.code })}
                        className="inline-block rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                      >
                        {area.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <SearchResultFeed
            key={`results:${query.keyword}:${query.areaCode}:${query.moodSlug}:${query.occasionSlug}`}
            initialPage={page}
            query={query}
            isAuthenticated={user != null}
          />
        )}
      </div>
    </div>
  )
}
