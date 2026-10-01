import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getPostList,
  POST_LIST_PAGE_SIZE,
  type PostListCursor,
  type PostListItem,
  type PostListPage,
} from '@/lib/posts/post-list'
import type { Database } from '@/types/database'

/**
 * S_HOME / S_EXPLORE「おすすめ」タブの一覧取得（pending-items D24 対応案b）。
 * 一致する興味タグの数が多い投稿を優先し、同数内は新着順にする。
 *
 * PostgREST の order() は列しか並べ替えられず、post_tags の一致数という集計値では
 * 並べられないため、ランキングと keyset ページングは DB 関数 recommended_post_ranks に任せる。
 * ここでは返ってきた投稿ID列の順序どおりに、既存 getPostList で埋め込みデータ
 * （著者・カフェ・画像・タグ・いいね/保存状態）を取り直すだけにする
 *   supabase/migrations/20261001131827_recommended_post_ranks.sql
 */

type Client = SupabaseClient<Database>

type RecommendedPostRank = { post_id: string; match_count: number; published_at: string }

export type GetRecommendedPostListParams = {
  /** user_interest_tags から引いた興味タグID。空配列なら呼び出し元で新着にフォールバックすること */
  tagIds: string[]
  viewerId: string
  cursor?: PostListCursor | null
  limit?: number
}

export async function getRecommendedPostList(
  supabase: Client,
  { tagIds, viewerId, cursor, limit = POST_LIST_PAGE_SIZE }: GetRecommendedPostListParams,
): Promise<PostListPage> {
  if (tagIds.length === 0) return { items: [], nextCursor: null }

  const { data, error } = await supabase.rpc('recommended_post_ranks', {
    p_tag_ids: tagIds,
    p_cursor_match_count: cursor?.matchCount,
    p_cursor_published_at: cursor?.publishedAt,
    p_cursor_id: cursor?.id,
    // 次ページの有無を追加の COUNT なしで判定するため1件多く取る（getPostList と同じ手法）
    p_limit: limit + 1,
  })
  if (error) throw new Error(`おすすめ投稿の取得に失敗しました: ${error.message}`)

  const ranks = (data ?? []) as RecommendedPostRank[]
  const pageRanks = ranks.slice(0, limit)
  if (pageRanks.length === 0) return { items: [], nextCursor: null }

  const page = await getPostList(supabase, {
    postIds: pageRanks.map((rank) => rank.post_id),
    viewerId,
    limit: pageRanks.length,
  })

  // getPostList は postIds に対して順序を保証しない。並びの正はDB関数のランクなので並べ直す
  const itemsById = new Map(page.items.map((item) => [item.id, item]))
  const items = pageRanks
    .map((rank) => itemsById.get(rank.post_id))
    .filter((item): item is PostListItem => item !== undefined)

  const lastRank = ranks.length > limit ? pageRanks.at(-1) : undefined
  const nextCursor: PostListCursor | null = lastRank
    ? { matchCount: lastRank.match_count, publishedAt: lastRank.published_at, id: lastRank.post_id }
    : null

  return { items, nextCursor }
}
