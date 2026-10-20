import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeCriteria, BadgeTrigger } from '@/types/badges'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

// トリガーごとに評価対象を絞る（毎回全バッジを評価しない）。
// docs/seed/badges-initial-set.md #判定タイミング
export const TRIGGER_CRITERIA_TYPES: Record<BadgeTrigger, BadgeCriteria['type'][]> = {
  POST_CREATED: [
    'post_count',
    'distinct_area_count',
    'post_count_with_tag',
    'post_count_with_tags_or',
    'distinct_scene_tag_count',
  ],
  REGULAR_AWARDED: ['regular_customer_count'],
  LIKE_RECEIVED: ['likes_received'],
  LIKE_GIVEN: ['likes_given'],
  FOLLOW_RECEIVED: ['follower_count'],
}

// 進捗表示 (lib/badges/progress.ts) からも呼ぶため export する。
// likes_received の RPC 経由など、RLS絡みの注意点を二重実装しないための共有点
export async function countPublishedPosts(supabase: Client, userId: string): Promise<number> {
  const { count } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', userId)
    .eq('status', 'published')
    .is('deleted_at', null)
  return count ?? 0
}

// area_visits は「自エリア+親エリア」の2行が入りうるため、scope.level で絞ってから数える
// （docs/architecture/data-model/README.md #エリアコードの一貫性）
export async function countDistinctAreas(
  supabase: Client,
  userId: string,
  scope: { level: string; prefecture_code?: string },
): Promise<number> {
  let query = supabase
    .from('area_visits')
    .select('area_code, areas!inner(level, prefecture_code)')
    .eq('user_id', userId)
    .eq('areas.level', scope.level)
  if (scope.prefecture_code) {
    query = query.eq('areas.prefecture_code', scope.prefecture_code)
  }
  const { data } = await query
  return data?.length ?? 0
}

export async function countPublishedPostsWithTag(
  supabase: Client,
  userId: string,
  tagSlug: string,
): Promise<number> {
  const { count } = await supabase
    .from('post_tags')
    .select('post_id, posts!inner(author_id, status, deleted_at), tags!inner(slug)', {
      count: 'exact',
      head: true,
    })
    .eq('posts.author_id', userId)
    .eq('posts.status', 'published')
    .is('posts.deleted_at', null)
    .eq('tags.slug', tagSlug)
  return count ?? 0
}

export async function countPublishedPostsWithAnyTag(
  supabase: Client,
  userId: string,
  tagSlugs: string[],
): Promise<number> {
  const { data } = await supabase
    .from('post_tags')
    .select('post_id, posts!inner(author_id, status, deleted_at), tags!inner(slug)')
    .eq('posts.author_id', userId)
    .eq('posts.status', 'published')
    .is('posts.deleted_at', null)
    .in('tags.slug', tagSlugs)
  // 同じ投稿が複数タグ (work/study 等) に該当すると重複するため post_id で去重する
  const distinctPostIds = new Set((data ?? []).map((row) => row.post_id as string))
  return distinctPostIds.size
}

export async function countDistinctSceneTags(
  supabase: Client,
  userId: string,
  category: string,
): Promise<number> {
  const { data } = await supabase
    .from('post_tags')
    .select('tag_id, posts!inner(author_id, status, deleted_at), tags!inner(category)')
    .eq('posts.author_id', userId)
    .eq('posts.status', 'published')
    .is('posts.deleted_at', null)
    .eq('tags.category', category)
  const distinctTagIds = new Set((data ?? []).map((row) => row.tag_id as string))
  return distinctTagIds.size
}

// revoked_at is null の現役認定のみ数える（取消済みはカウントしない）
export async function countActiveRegularCustomers(
  supabase: Client,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from('regular_customers')
    .select('cafe_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)
  return count ?? 0
}

// follows_select_all がブロックを反映した（D36）ため、素朴な count は呼び出しセッションと
// 無関係な第三者間のブロックで過小評価になりうる。RLS をバイパスする count_followers RPC を使う
// （count_likes_given / count_likes_received と同じ理由。
//   supabase/migrations/20261020120000_follows_select_visibility.sql）
export async function countFollowers(supabase: Client, userId: string): Promise<number> {
  const { data } = await supabase.rpc('count_followers', { p_user_id: userId })
  return data ?? 0
}

// likes は誰からも見えるが posts への JOIN は posts_select の visibility 制限を受けるため、
// 呼び出しセッション（いいねした側）からは相手の非公開（followers限定）投稿ぶんの
// いいねが見えず過小評価になる。RLS をバイパスする count_likes_received RPC を使う
// （`/code-review` で指摘。supabase/migrations/20260923130000 参照）
export async function countLikesReceived(supabase: Client, userId: string): Promise<number> {
  const { data } = await supabase.rpc('count_likes_received', { p_user_id: userId })
  return data ?? 0
}

// likes_select_all が投稿の可視性（posts_select）を継承したため、いいねした投稿が後から
// hidden/archived/削除/フォロー外れで見えなくなると呼び出しセッション（いいねした側）から
// 数えられなくなり過小評価になる。RLS をバイパスする count_likes_given RPC を使う
// （countLikesReceived と同じ理由。supabase/migrations/20260923150000 参照）
export async function countLikesGiven(supabase: Client, userId: string): Promise<number> {
  const { data } = await supabase.rpc('count_likes_given', { p_user_id: userId })
  return data ?? 0
}

/** badges.criteria の内容に応じて、渡された userId が条件を満たすかを判定する */
export async function evaluateCriteria(
  supabase: Client,
  userId: string,
  criteria: BadgeCriteria,
): Promise<boolean> {
  switch (criteria.type) {
    case 'post_count':
      return (await countPublishedPosts(supabase, userId)) >= criteria.threshold
    case 'distinct_area_count':
      return (await countDistinctAreas(supabase, userId, criteria.scope)) >= criteria.threshold
    case 'post_count_with_tag':
      return (
        (await countPublishedPostsWithTag(supabase, userId, criteria.tag_slug)) >=
        criteria.threshold
      )
    case 'post_count_with_tags_or':
      return (
        (await countPublishedPostsWithAnyTag(supabase, userId, criteria.tag_slugs)) >=
        criteria.threshold
      )
    case 'distinct_scene_tag_count':
      return (
        (await countDistinctSceneTags(supabase, userId, criteria.category)) >= criteria.threshold
      )
    case 'regular_customer_count':
      return (await countActiveRegularCustomers(supabase, userId)) >= criteria.threshold
    case 'follower_count':
      return (await countFollowers(supabase, userId)) >= criteria.threshold
    case 'likes_received':
      return (await countLikesReceived(supabase, userId)) >= criteria.threshold
    case 'likes_given':
      return (await countLikesGiven(supabase, userId)) >= criteria.threshold
  }
}
