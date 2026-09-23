import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeCriteria } from '@/types/badges'
import type { Database } from '@/types/database'
import {
  countActiveRegularCustomers,
  countDistinctAreas,
  countDistinctSceneTags,
  countFollowers,
  countLikesGiven,
  countLikesReceived,
  countPublishedPosts,
  countPublishedPostsWithAnyTag,
  countPublishedPostsWithTag,
} from './rules'

type Client = SupabaseClient<Database>

export type BadgeProgress = {
  id: string
  code: string
  name: string
  description: string
  current: number
  threshold: number
  earned: boolean
  awardedAt: string | null
}

// criteria.type + 可変パラメータ（threshold除く）でグルーピングし、同じ集計を使い回す。
// バッジ20件を1件ずつ evaluateCriteria すると最大20回のDB往復になるため
// （lib/badges/rules.ts の TRIGGER_CRITERIA_TYPES と同じ「typeごとに絞る」発想）
function groupKey(criteria: BadgeCriteria): string {
  switch (criteria.type) {
    case 'post_count':
      return 'post_count'
    case 'distinct_area_count':
      return `distinct_area_count:${criteria.scope.level}:${criteria.scope.prefecture_code ?? ''}`
    case 'post_count_with_tag':
      return `post_count_with_tag:${criteria.tag_slug}`
    case 'post_count_with_tags_or':
      return `post_count_with_tags_or:${[...criteria.tag_slugs].sort().join(',')}`
    case 'distinct_scene_tag_count':
      return `distinct_scene_tag_count:${criteria.category}`
    case 'regular_customer_count':
      return 'regular_customer_count'
    case 'follower_count':
      return 'follower_count'
    case 'likes_received':
      return 'likes_received'
    case 'likes_given':
      return 'likes_given'
  }
}

async function runCount(
  supabase: Client,
  userId: string,
  criteria: BadgeCriteria,
): Promise<number> {
  switch (criteria.type) {
    case 'post_count':
      return countPublishedPosts(supabase, userId)
    case 'distinct_area_count':
      return countDistinctAreas(supabase, userId, criteria.scope)
    case 'post_count_with_tag':
      return countPublishedPostsWithTag(supabase, userId, criteria.tag_slug)
    case 'post_count_with_tags_or':
      return countPublishedPostsWithAnyTag(supabase, userId, criteria.tag_slugs)
    case 'distinct_scene_tag_count':
      return countDistinctSceneTags(supabase, userId, criteria.category)
    case 'regular_customer_count':
      return countActiveRegularCustomers(supabase, userId)
    case 'follower_count':
      return countFollowers(supabase, userId)
    case 'likes_received':
      return countLikesReceived(supabase, userId)
    case 'likes_given':
      return countLikesGiven(supabase, userId)
  }
}

/**
 * 全バッジぶんの進捗（現在値/しきい値/獲得済みか）を返す。
 * 「獲得済み」は user_badges の実績を正とし、current>=threshold からの再計算はしない
 * （award_badge はトリガーとなったアクション時点の判定なので、集計のタイミング差を
 * 　「挑戦中」表示のズレとして許容する。詳細は docs/product/pending-items.md D59 隣接の決定）
 */
export async function getAllBadgeProgress(
  supabase: Client,
  userId: string,
): Promise<BadgeProgress[]> {
  const [{ data: badges }, { data: awarded }] = await Promise.all([
    supabase.from('badges').select('id, code, name, description, criteria').order('code'),
    supabase.from('user_badges').select('badge_id, awarded_at').eq('user_id', userId),
  ])

  const awardedMap = new Map((awarded ?? []).map((row) => [row.badge_id, row.awarded_at]))
  const list = badges ?? []

  const uniqueCriteriaByKey = new Map<string, BadgeCriteria>()
  for (const badge of list) {
    const criteria = badge.criteria as BadgeCriteria
    const key = groupKey(criteria)
    if (!uniqueCriteriaByKey.has(key)) uniqueCriteriaByKey.set(key, criteria)
  }

  const entries = [...uniqueCriteriaByKey.entries()]
  const counts = await Promise.all(
    entries.map(([, criteria]) => runCount(supabase, userId, criteria)),
  )
  const countByKey = new Map(entries.map(([key], index) => [key, counts[index]]))

  return list.map((badge) => {
    const criteria = badge.criteria as BadgeCriteria
    const current = countByKey.get(groupKey(criteria)) ?? 0
    const awardedAt = awardedMap.get(badge.id) ?? null
    return {
      id: badge.id,
      code: badge.code,
      name: badge.name,
      description: badge.description ?? '',
      current: Math.min(current, criteria.threshold),
      threshold: criteria.threshold,
      earned: awardedAt !== null,
      awardedAt,
    }
  })
}
