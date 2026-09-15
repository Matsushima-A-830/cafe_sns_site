import type { SupabaseClient } from '@supabase/supabase-js'
import type { PostListOptions, PostListTag } from '@/lib/posts/post-list'
import type { FeedQuery } from '@/lib/validators/feed'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

/** 気分入り口（幹A）に出すチップの数。選択のパラドックス回避で絞る */
export const MOOD_TAG_LIMIT = 12

/**
 * 「今、どんなカフェ気分？」のチップ。厳選タグの occasion / mood だけを priority 順に出す。
 * area カテゴリの行は存在しない（エリアの正は areas マスタ — pending-items D20）
 *   docs/seed/curated-tags-initial-set.md
 */
export async function getMoodTags(
  supabase: Client,
  limit = MOOD_TAG_LIMIT,
): Promise<PostListTag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, slug, label')
    .eq('is_curated', true)
    .in('category', ['occasion', 'mood'])
    .order('priority', { ascending: false })
    .order('slug')
    .limit(limit)

  // チップが1件も無い画面は正常時と区別が付かないので原因をサーバーログに残す
  if (error) {
    console.error('[feed] 気分タグの取得に失敗:', error.message)
    return []
  }
  return data ?? []
}

/** tag は絞り込み中のタグ（見出しに出す）。slug しか無いと表示が英語のままになる */
export type FeedResolution = { options: PostListOptions; tag: PostListTag | null }

/**
 * 表示条件（タブ・クエリ）を一覧取得の絞り込みに変換する。
 * null を返したときは「条件を満たす投稿が原理的に0件」（存在しないタグ slug、
 * 未ログインでのフォロー中タブ）で、呼び出し元は取得せず空状態を出す。
 *
 * scope='recommended' の実体は user_interest_tags の単純一致。興味タグ未設定なら
 * 新着と同じになる（スコアリングは likes / bookmarks 実装後 — pending-items D24）
 */
export async function resolveFeedOptions(
  supabase: Client,
  query: FeedQuery,
  userId: string | null,
): Promise<FeedResolution | null> {
  if (query.scope === 'following' && !userId) return null

  const options: PostListOptions = { areaCode: query.areaCode }
  let tag: PostListTag | null = null

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
    if (tagIds.length > 0) options.tagIds = tagIds
  }

  if (query.scope === 'following' && userId) {
    options.followerId = userId
  }

  return { options, tag }
}
