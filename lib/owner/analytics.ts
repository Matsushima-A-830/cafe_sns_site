import type { SupabaseClient } from '@supabase/supabase-js'
import { pctChange, startOfJstWeek, type WeeklyStat } from '@/lib/owner/dashboard'
import { getOwnedCafeSummary } from '@/lib/owner/regulars'
import type { Database } from '@/types/database'

/**
 * S_OWNER_ANALYTICS の読み取り。
 *   docs/design/wireframes/owner.md#s_owner_analytics投稿分析
 *
 * posts の SELECT RLS（posts_select_own）は status・deleted_at を見ない設計なので、
 * 集計クエリは必ず status='published' AND deleted_at IS NULL を明示する
 *   docs/architecture/data-model/tables.md #posts_select_own
 */

type Client = SupabaseClient<Database>

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type AnalyticsPeriodWeeks = 4 | 12

export type WeekBucket = { start: Date; end: Date }

/** weekStart（今週月曜0:00 JST）を含む直近 weeks 週分のバケットを古い順に返す */
export function buildWeekBuckets(weekStart: Date, weeks: number): WeekBucket[] {
  return Array.from({ length: weeks }, (_, i) => {
    const offset = weeks - 1 - i
    const start = new Date(weekStart.getTime() - offset * WEEK_MS)
    return { start, end: new Date(start.getTime() + WEEK_MS) }
  })
}

export type TrendPoint = { weekStart: string; posts: number; likes: number; bookmarks: number }

export type TagStat = { tagId: string; label: string; category: string; count: number }

/** post_tags を tag_id で件数集計し、多い順（同数は label 昇順）で上位 limit 件を返す */
export function aggregateTagCounts(
  rows: { tagId: string; label: string; category: string }[],
  limit = 10,
): TagStat[] {
  const counts = new Map<string, TagStat>()
  for (const row of rows) {
    const existing = counts.get(row.tagId)
    if (existing) {
      existing.count += 1
    } else {
      counts.set(row.tagId, {
        tagId: row.tagId,
        label: row.label,
        category: row.category,
        count: 1,
      })
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
}

export type TopPoster = {
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  postCount: number
}

export type WeekdayCongestion = {
  dayOfWeek: number
  label: string
  levelAvg: number | null
  sampleCount: number
}

/** RPC は 0(日)〜6(土) の順で返るため、ワイヤー通り月始まりに並べ替える */
const WEEKDAY_ORDER: { dow: number; label: string }[] = [
  { dow: 1, label: '月' },
  { dow: 2, label: '火' },
  { dow: 3, label: '水' },
  { dow: 4, label: '木' },
  { dow: 5, label: '金' },
  { dow: 6, label: '土' },
  { dow: 0, label: '日' },
]

export function sortWeekdayCongestion(
  rows: { day_of_week: number; level_avg: number | null; sample_count: number | null }[],
): WeekdayCongestion[] {
  const byDay = new Map(rows.map((row) => [row.day_of_week, row]))
  return WEEKDAY_ORDER.map(({ dow, label }) => {
    const row = byDay.get(dow)
    return {
      dayOfWeek: dow,
      label,
      levelAvg: row?.level_avg ?? null,
      sampleCount: row?.sample_count ?? 0,
    }
  })
}

export type CafeAnalytics = {
  cafe: { id: string; name: string }
  weeks: AnalyticsPeriodWeeks
  posts: WeeklyStat
  likes: WeeklyStat
  bookmarks: WeeklyStat
  trend: TrendPoint[]
  tags: TagStat[]
  topPosters: TopPoster[]
  weekdayCongestion: WeekdayCongestion[]
}

type PostAggRow = { like_count: number; bookmark_count: number; published_at: string | null }

function periodPostsQuery(supabase: Client, cafeId: string, from: Date, to: Date) {
  return supabase
    .from('posts')
    .select('like_count, bookmark_count, published_at')
    .eq('cafe_id', cafeId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .gte('published_at', from.toISOString())
    .lt('published_at', to.toISOString())
}

function sumPosts(rows: PostAggRow[]) {
  return {
    count: rows.length,
    likes: rows.reduce((sum, row) => sum + row.like_count, 0),
    bookmarks: rows.reduce((sum, row) => sum + row.bookmark_count, 0),
  }
}

export async function getCafeAnalytics(
  supabase: Client,
  cafeId: string,
  weeks: AnalyticsPeriodWeeks = 4,
  now: Date = new Date(),
): Promise<CafeAnalytics | null> {
  const cafe = await getOwnedCafeSummary(supabase, cafeId)
  if (!cafe) return null

  const weekStart = startOfJstWeek(now)
  const buckets = buildWeekBuckets(weekStart, weeks)
  // buckets[0].start / buckets.at(-1).end と同じ値だが、noNonNullAssertion を避けて
  // buildWeekBuckets と同じ式から直接計算する
  const currentStart = new Date(weekStart.getTime() - (weeks - 1) * WEEK_MS)
  const currentEnd = new Date(weekStart.getTime() + WEEK_MS)
  const previousStart = new Date(currentStart.getTime() - weeks * WEEK_MS)
  const previousEnd = currentStart

  const [bucketResults, previousResult, tagsResult, topPostersResult, weekdayResult] =
    await Promise.all([
      Promise.all(
        buckets.map((bucket) => periodPostsQuery(supabase, cafeId, bucket.start, bucket.end)),
      ),
      periodPostsQuery(supabase, cafeId, previousStart, previousEnd),
      supabase
        .from('post_tags')
        .select(
          'tag_id, tags(label, category), posts!inner(cafe_id, status, deleted_at, published_at)',
        )
        .eq('posts.cafe_id', cafeId)
        .eq('posts.status', 'published')
        .is('posts.deleted_at', null)
        .gte('posts.published_at', currentStart.toISOString())
        .lt('posts.published_at', currentEnd.toISOString()),
      supabase.rpc('get_cafe_top_posters', {
        p_cafe_id: cafeId,
        p_from: currentStart.toISOString(),
        p_to: currentEnd.toISOString(),
      }),
      // weeks（期間トグル）で絞らない: サンプル数を確保するための意図的な判断（D57）
      supabase.rpc('get_cafe_weekday_congestion', { p_cafe_id: cafeId }),
    ])

  for (const result of bucketResults) {
    if (result.error) throw new Error(`投稿分析の週次集計に失敗しました: ${result.error.message}`)
  }
  if (previousResult.error)
    throw new Error(`投稿分析の前期間集計に失敗しました: ${previousResult.error.message}`)
  if (tagsResult.error) throw new Error(`タグ集計の取得に失敗しました: ${tagsResult.error.message}`)
  if (topPostersResult.error)
    throw new Error(`投稿者トップの取得に失敗しました: ${topPostersResult.error.message}`)
  if (weekdayResult.error)
    throw new Error(`曜日別混雑度の取得に失敗しました: ${weekdayResult.error.message}`)

  const trend: TrendPoint[] = buckets.map((bucket, i) => {
    const agg = sumPosts(bucketResults[i]?.data ?? [])
    return {
      weekStart: bucket.start.toISOString(),
      posts: agg.count,
      likes: agg.likes,
      bookmarks: agg.bookmarks,
    }
  })
  const current = {
    count: trend.reduce((sum, point) => sum + point.posts, 0),
    likes: trend.reduce((sum, point) => sum + point.likes, 0),
    bookmarks: trend.reduce((sum, point) => sum + point.bookmarks, 0),
  }
  const previous = sumPosts(previousResult.data ?? [])

  type TagJoinRow = { tag_id: string; tags: { label: string; category: string } | null }
  const tagRows = ((tagsResult.data ?? []) as TagJoinRow[])
    .map((row) =>
      row.tags ? { tagId: row.tag_id, label: row.tags.label, category: row.tags.category } : null,
    )
    .filter((row): row is { tagId: string; label: string; category: string } => row !== null)

  return {
    cafe,
    weeks,
    posts: { count: current.count, changePct: pctChange(current.count, previous.count) },
    likes: { count: current.likes, changePct: pctChange(current.likes, previous.likes) },
    bookmarks: {
      count: current.bookmarks,
      changePct: pctChange(current.bookmarks, previous.bookmarks),
    },
    trend,
    tags: aggregateTagCounts(tagRows),
    topPosters: (topPostersResult.data ?? []).map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      postCount: row.post_count,
    })),
    weekdayCongestion: sortWeekdayCongestion(weekdayResult.data ?? []),
  }
}
