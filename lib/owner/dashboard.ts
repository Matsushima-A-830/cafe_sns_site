import type { SupabaseClient } from '@supabase/supabase-js'
import { type CongestionSummary, getCafeCongestion } from '@/lib/cafes/congestion'
import { getPostList, type PostListItem } from '@/lib/posts/post-list'
import type { Database } from '@/types/database'

/**
 * S_OWNER_DASHBOARD の読み取り。
 *
 * cafes の SELECT RLS（cafes_select_active_authenticated）は status='active' なら
 * verified_owner_id を問わず全員に見せる設計（S_CAFE_DETAIL を誰でも見られるようにするため）。
 * そのため「このカフェの経営情報」を返してよいかは RLS に委ねられず、ここで
 * verified_owner_id === 呼び出し元本人 を明示的に検証する。検証を省くと role='owner' を
 * 持つ誰でも他人のカフェのダッシュボードを閲覧できてしまう
 *   docs/architecture/data-model/tables.md #cafes
 */

type Client = SupabaseClient<Database>

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const LATEST_POSTS_LIMIT = 6

export type WeeklyStat = { count: number; changePct: number | null }

export type OwnerDashboard = {
  cafe: { id: string; name: string; verifiedSince: string | null }
  posts: WeeklyStat
  likes: WeeklyStat
  bookmarks: WeeklyStat
  congestion: CongestionSummary
  latestPosts: PostListItem[]
}

/**
 * JST 暦日で「今週の月曜 0:00」を表す時刻を UTC の Date で返す。
 * now を注入できるのはテスト用（congestion.ts の p_now と同じ考え方）
 */
export function startOfJstWeek(now: Date): Date {
  const jstMidnight = new Date(now.getTime() + JST_OFFSET_MS)
  jstMidnight.setUTCHours(0, 0, 0, 0)

  // JST 基準の曜日（0=日曜〜6=土曜）から月曜まで何日戻るか
  const dayOfWeek = jstMidnight.getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7

  const jstMonday = new Date(jstMidnight.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000)
  return new Date(jstMonday.getTime() - JST_OFFSET_MS)
}

/** 前週比。前週が0件のときは割合が意味を持たないので null（「—」表示にする） */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** 前週比の表示テキスト。符号を明示し、色だけに依存しない（CLAUDE.md アクセシビリティ） */
export function formatChangePct(pct: number | null): string {
  if (pct === null) return '—'
  if (pct === 0) return '±0%'
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

type WeeklyPostRow = { published_at: string | null; like_count: number; bookmark_count: number }

function aggregateWeek(rows: WeeklyPostRow[], weekStart: Date) {
  const totals = { count: 0, likes: 0, bookmarks: 0 }
  for (const row of rows) {
    if (!row.published_at) continue
    if (new Date(row.published_at).getTime() < weekStart.getTime()) continue
    totals.count += 1
    totals.likes += row.like_count
    totals.bookmarks += row.bookmark_count
  }
  return totals
}

export type OwnedCafeSummary = { id: string; name: string }

/**
 * マイページの「自分の店舗」導線用。1ユーザーが複数カフェの verified_owner_id を持つことも
 * 制約上は可能だが、MVPでは「1申請=1カフェ」前提のまま先頭1件だけを案内する
 * （複数店舗オーナーの一覧UIは pending-items に送る）
 */
export async function getOwnedCafe(
  supabase: Client,
  userId: string,
): Promise<OwnedCafeSummary | null> {
  const { data, error } = await supabase
    .from('cafes')
    .select('id, name')
    .eq('verified_owner_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`経営しているカフェの取得に失敗しました: ${error.message}`)
  return data
}

export async function getOwnerDashboard(
  supabase: Client,
  cafeId: string,
  now: Date = new Date(),
): Promise<OwnerDashboard | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: cafe, error: cafeError } = await supabase
    .from('cafes')
    .select('id, name, verified_owner_id')
    .eq('id', cafeId)
    .maybeSingle()
  if (cafeError) throw new Error(`カフェの取得に失敗しました: ${cafeError.message}`)
  if (!cafe || cafe.verified_owner_id !== user.id) return null

  const weekStart = startOfJstWeek(now)
  const lastWeekStart = new Date(weekStart.getTime() - WEEK_MS)

  const [postsResult, verificationResult, congestion, latest] = await Promise.all([
    supabase
      .from('posts')
      .select('published_at, like_count, bookmark_count')
      .eq('cafe_id', cafeId)
      .eq('status', 'published')
      .is('deleted_at', null)
      .gte('published_at', lastWeekStart.toISOString()),
    supabase
      .from('cafe_owner_verifications')
      .select('reviewed_at')
      .eq('cafe_id', cafeId)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getCafeCongestion(supabase, cafeId),
    getPostList(supabase, { cafeId, viewerId: user.id, limit: LATEST_POSTS_LIMIT }),
  ])

  if (postsResult.error)
    throw new Error(`今週の投稿集計の取得に失敗しました: ${postsResult.error.message}`)
  if (verificationResult.error)
    throw new Error(`オーナー認証情報の取得に失敗しました: ${verificationResult.error.message}`)

  const rows = postsResult.data ?? []
  const thisWeek = aggregateWeek(rows, weekStart)
  // 先週ぶんは「lastWeekStart以上 weekStart未満」＝全体から今週を除いた残り
  const lastWeek = {
    count: rows.length - thisWeek.count,
    likes: rows.reduce((sum, row) => sum + row.like_count, 0) - thisWeek.likes,
    bookmarks: rows.reduce((sum, row) => sum + row.bookmark_count, 0) - thisWeek.bookmarks,
  }

  return {
    cafe: {
      id: cafe.id,
      name: cafe.name,
      verifiedSince: verificationResult.data?.reviewed_at ?? null,
    },
    posts: { count: thisWeek.count, changePct: pctChange(thisWeek.count, lastWeek.count) },
    likes: { count: thisWeek.likes, changePct: pctChange(thisWeek.likes, lastWeek.likes) },
    bookmarks: {
      count: thisWeek.bookmarks,
      changePct: pctChange(thisWeek.bookmarks, lastWeek.bookmarks),
    },
    congestion,
    latestPosts: latest.items,
  }
}
