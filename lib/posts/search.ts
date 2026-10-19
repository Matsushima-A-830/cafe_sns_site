import type { SupabaseClient } from '@supabase/supabase-js'
import { reportError } from '@/lib/monitoring/report-error'
import { getMoodTags, type MoodTag } from '@/lib/posts/feed'
import type { PostListOptions, PostListTag } from '@/lib/posts/post-list'
import type { SearchQuery } from '@/lib/validators/search'
import type { Database } from '@/types/database'

/**
 * S_SEARCH（タグ検索）の一覧取得。投稿一覧そのものは lib/posts/post-list.ts の
 * getPostList を使い回す（既存の取得関数を拡張する — docs/operations/development-cycle.md）
 *   docs/design/wireframes/browsing.md #S_SEARCH
 */

type Client = SupabaseClient<Database>

/** 「よく使うタグ」チップの初期表示数。選択のパラドックス回避で絞る（ワイヤー指定） */
export const FREQUENT_TAG_LIMIT = 7

export type AreaOption = { code: string; label: string }

export type SearchResolution = {
  options: PostListOptions
  moodTag: PostListTag | null
  occasionTag: PostListTag | null
}

/**
 * 表示条件（クエリ）を一覧取得の絞り込みに変換する。
 * null を返したときは「条件を満たす投稿が原理的に0件」（存在しないタグ slug）で、
 * 呼び出し元は取得せず0件状態を出す（resolveFeedOptions と同じパターン）
 */
export async function resolveSearchOptions(
  supabase: Client,
  query: SearchQuery,
  userId: string | null,
): Promise<SearchResolution | null> {
  const options: PostListOptions = {
    areaCode: query.areaCode,
    viewerId: userId,
    keyword: query.keyword ?? undefined,
  }

  const moodTag = query.moodSlug ? await findTagBySlug(supabase, query.moodSlug, 'mood') : null
  if (query.moodSlug && !moodTag) return null
  if (moodTag) options.moodTagId = moodTag.id

  const occasionTag = query.occasionSlug
    ? await findTagBySlug(supabase, query.occasionSlug, 'occasion')
    : null
  if (query.occasionSlug && !occasionTag) return null
  if (occasionTag) options.occasionTagId = occasionTag.id

  return { options, moodTag, occasionTag }
}

async function findTagBySlug(
  supabase: Client,
  slug: string,
  category: 'mood' | 'occasion',
): Promise<PostListTag | null> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, slug, label')
    .eq('slug', slug)
    .eq('category', category)
    .maybeSingle()
  if (error) throw new Error(`タグの取得に失敗しました (slug=${slug}): ${error.message}`)
  return data
}

/** エリア/雰囲気/利用機会の各ドロップダウンで使う一覧。エリアはタグではなく areas が正 */
export async function getAreaOptions(supabase: Client): Promise<AreaOption[]> {
  const { data, error } = await supabase
    .from('areas')
    .select('code, label')
    .eq('level', 'ward')
    .order('priority', { ascending: false })

  if (error) {
    reportError('search', 'エリア一覧の取得に失敗', error)
    return []
  }
  return data ?? []
}

/** 雰囲気(mood) / 利用機会(occasion) ドロップダウンの候補一覧 */
export async function getTagOptions(
  supabase: Client,
  category: 'mood' | 'occasion',
): Promise<PostListTag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id, slug, label')
    .eq('is_curated', true)
    .eq('category', category)
    .order('priority', { ascending: false })
    .order('slug')

  if (error) {
    reportError('search', 'タグ一覧の取得に失敗', error)
    return []
  }
  return data ?? []
}

/** S_SEARCH の「よく使うタグ」チップ。ホームの気分チップ（lib/posts/feed.ts）と同じ絞り込みを再利用する */
export type FrequentTag = MoodTag

/**
 * 「よく使うタグ」チップ。mood/occasion 混在で priority 順
 *   docs/design/wireframes/browsing.md #S_SEARCH「選択のパラドックス回避」
 */
export function getFrequentTags(
  supabase: Client,
  limit = FREQUENT_TAG_LIMIT,
): Promise<FrequentTag[]> {
  return getMoodTags(supabase, limit)
}

/**
 * 0件時の「もしかして」提案。簡易版 — 選択中タグを除いた優先度上位を出すだけで、
 * 真の類似度（共起・意味的近さ）ではない。精緻化は pending-items へ
 */
export async function getRelatedTagSuggestions(
  supabase: Client,
  excludeTagIds: string[],
  limit = 2,
): Promise<FrequentTag[]> {
  const tags = await getMoodTags(supabase, limit + excludeTagIds.length)
  return tags.filter((tag) => !excludeTagIds.includes(tag.id)).slice(0, limit)
}

/**
 * 0件時の「エリアを広げる」提案。簡易版 — 選択中エリアを除いた優先度上位を出すだけで、
 * 地理的な隣接エリアではない。精緻化は pending-items へ
 */
export async function getNearbyAreaSuggestions(
  supabase: Client,
  excludeAreaCode: string | null,
  limit = 3,
): Promise<AreaOption[]> {
  const { data, error } = await supabase
    .from('areas')
    .select('code, label')
    .eq('level', 'ward')
    .order('priority', { ascending: false })
    .limit(limit + (excludeAreaCode ? 1 : 0))

  if (error) {
    reportError('search', 'エリア提案の取得に失敗', error)
    return []
  }
  return (data ?? []).filter((area) => area.code !== excludeAreaCode).slice(0, limit)
}
