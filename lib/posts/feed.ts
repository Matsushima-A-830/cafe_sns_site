import type { SupabaseClient } from '@supabase/supabase-js'
import { cafeExists } from '@/lib/cafes/cafe-detail'
import { getNearbyCafes } from '@/lib/cafes/nearby'
import { reportError } from '@/lib/monitoring/report-error'
import {
  getPostList,
  type PostListCursor,
  type PostListOptions,
  type PostListPage,
  type PostListTag,
} from '@/lib/posts/post-list'
import { getRecommendedPostList } from '@/lib/posts/recommended-feed'
import { getPublicProfile } from '@/lib/profiles/public-profile'
import type { FeedQuery } from '@/lib/validators/feed'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

/** 気分入り口（幹A）に出すチップの数。選択のパラドックス回避で絞る */
export const MOOD_TAG_LIMIT = 12

/** S_EXPLORE「近くのカフェ」タブの対象カフェ件数。投稿フィードなので /map の100件より絞る */
export const NEARBY_CAFE_LIMIT = 40

/** S_SEARCH の「よく使うタグ」チップは、押した先で mood/occasion どちらの絞り込みかを出し分ける */
export type MoodTag = PostListTag & { category: 'mood' | 'occasion' }

/**
 * 「今、どんなカフェ気分？」のチップ。厳選タグの occasion / mood だけを priority 順に出す。
 * area カテゴリの行は存在しない（エリアの正は areas マスタ — pending-items D20）
 * lib/posts/search.ts の「よく使うタグ」チップも同じ絞り込みなのでこれを再利用する
 *   docs/seed/curated-tags-initial-set.md
 */
export async function getMoodTags(supabase: Client, limit = MOOD_TAG_LIMIT): Promise<MoodTag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, slug, label, category')
    .eq('is_curated', true)
    .in('category', ['occasion', 'mood'])
    .order('priority', { ascending: false })
    .order('slug')
    .limit(limit)

  // チップが1件も無い画面は正常時と区別が付かないので原因をサーバーログに残す
  if (error) {
    reportError('feed', '気分タグの取得に失敗', error)
    return []
  }
  return (data ?? []) as MoodTag[]
}

/** tag は絞り込み中のタグ（見出しに出す）。slug しか無いと表示が英語のままになる */
export type FeedResolution = {
  options: PostListOptions
  tag: PostListTag | null
  /**
   * true なら一致タグ数順（recommended_post_ranks）で取得する。scope='recommended' かつ
   * tagSlug 指定なし（mood チップ絞り込みと混同しない）かつ興味タグが1件以上あるときだけ立つ
   *   pending-items D24
   */
  useRecommendedScoring: boolean
}

/**
 * 表示条件（タブ・クエリ）を一覧取得の絞り込みに変換する。
 * null を返したときは「条件を満たす投稿が原理的に0件」（存在しないタグ slug、
 * 未ログインでのフォロー中タブ、停止・削除済みの作者）で、呼び出し元は取得せず空状態を出す。
 *
 * scope='recommended' は user_interest_tags の一致タグ数が多い順（同数は新着順）。
 * 興味タグ未設定・未ログインは新着にフォールバックする（D24 対応案b、S_HOME/S_EXPLORE共通）
 */
export async function resolveFeedOptions(
  supabase: Client,
  query: FeedQuery,
  userId: string | null,
): Promise<FeedResolution | null> {
  if (query.scope === 'following' && !userId) return null

  // viewerId は絞り込みではなく「いいね済みか」を同じクエリで取るためだけに渡す。
  // ここで1度入れると5画面のフィードと「もっと見る」が揃って対応する
  const options: PostListOptions = { areaCode: query.areaCode, viewerId: userId }
  let tag: PostListTag | null = null
  let useRecommendedScoring = false

  if (query.authorUsername) {
    // 「もっと見る」はクライアントから username を受け取るため、ここでも実在する
    // active なユーザーかを確かめる。見ているのは status だけで、ブロック関係は
    // posts_select の not is_blocked_either_way(author_id) が担う
    const author = await getPublicProfile(supabase, query.authorUsername)
    if (!author) return null
    options.authorId = author.id
  }

  if (query.cafeId) {
    // ページ本体が404にするカフェ（存在しない・closed / hidden）を「もっと見る」だけが
    // すり抜けて返さないよう、ここでも RLS 越しに実在を確かめる
    if (!(await cafeExists(supabase, query.cafeId))) return null
    options.cafeId = query.cafeId
  }

  if (query.tagSlug) {
    const { data, error } = await supabase
      .from('tags')
      .select('id, slug, label')
      .eq('slug', query.tagSlug)
      .maybeSingle()
    if (error) throw new Error(`タグの取得に失敗しました (slug=${query.tagSlug}): ${error.message}`)
    if (!data) return null
    tag = data
    options.tagIds = [data.id]
  } else if (query.scope === 'recommended' && userId) {
    const { data, error } = await supabase
      .from('user_interest_tags')
      .select('tag_id')
      .eq('user_id', userId)
    if (error) throw new Error(`興味タグの取得に失敗しました: ${error.message}`)
    const tagIds = (data ?? []).map((row) => row.tag_id)
    if (tagIds.length > 0) {
      options.tagIds = tagIds
      useRecommendedScoring = true
    }
  }

  if (query.scope === 'following' && userId) {
    options.followerId = userId
  }

  if (query.scope === 'nearby') {
    // 現在地未取得（初回SSR描画の一瞬・Geolocation拒否）は呼び出し元がフォールバック中心を
    // 埋めて渡す想定。それでも null ならこの時点では対象カフェが定まらない
    if (query.lat === null || query.lng === null) return null
    const nearbyCafes = await getNearbyCafes(supabase, {
      lat: query.lat,
      lng: query.lng,
      limit: NEARBY_CAFE_LIMIT,
    })
    // 座標付きカフェが近くに1件も無い（半径カットオフは無い設計 — pending-items D63）
    if (nearbyCafes.length === 0) return null
    options.cafeIds = nearbyCafes.map((cafe) => cafe.cafeId)
  }

  return { options, tag, useRecommendedScoring }
}

/**
 * resolveFeedOptions の結果から実際に一覧を取る。S_HOME / S_EXPLORE / 「もっと見る」の
 * 3箇所が同じ分岐を共有することで、画面ごとに「おすすめ」の結果が食い違うのを防ぐ
 */
export async function getFeedPage(
  supabase: Client,
  resolved: FeedResolution,
  userId: string | null,
  cursor: PostListCursor | null = null,
): Promise<PostListPage> {
  if (resolved.useRecommendedScoring) {
    // useRecommendedScoring は userId 必須の分岐でしか立たない（呼び出し元のガードに依らない防御）
    if (!userId) return { items: [], nextCursor: null }
    return getRecommendedPostList(supabase, {
      tagIds: resolved.options.tagIds ?? [],
      viewerId: userId,
      cursor,
    })
  }
  return getPostList(supabase, { ...resolved.options, cursor })
}
