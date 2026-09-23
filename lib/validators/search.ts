import { z } from 'zod'
import { feedCursorSchema } from '@/lib/validators/feed'

/**
 * S_SEARCH（タグ検索）の絞り込み条件。URL のクエリからも
 * 「もっと見る」の Server Action 経由でも同じ形で入ってくる
 *   docs/design/wireframes/browsing.md #S_SEARCH
 */

// tags.slug は英小文字とハイフン、areas.code は ISO 3166-2 準拠で大文字と数字を含む
//   docs/seed/curated-tags-initial-set.md / docs/seed/areas-initial-set.md
const SLUG_PATTERN = /^[a-z0-9-]+$/
const AREA_CODE_PATTERN = /^[A-Za-z0-9-]+$/

const tagSlugSchema = z.string().max(60).regex(SLUG_PATTERN)
const areaCodeSchema = z.string().max(60).regex(AREA_CODE_PATTERN)
// 検索語は ilike のパターンに埋めるだけで、長さに意味は無い。
// 極端に長い入力でDBを無駄に叩かないための上限
const keywordSchema = z.string().trim().min(1).max(50)

export const searchQuerySchema = z.object({
  keyword: keywordSchema.nullable().default(null),
  areaCode: areaCodeSchema.nullable().default(null),
  moodSlug: tagSlugSchema.nullable().default(null),
  occasionSlug: tagSlugSchema.nullable().default(null),
})

/**
 * URL のクエリ文字列から絞り込みを組み立てる。壊れた値は 404 にせずその項目だけ捨てる
 * （parseFeedQuery と同じ理由 — lib/validators/feed.ts）
 */
export function parseSearchQuery(input: {
  keyword: string | null
  areaCode: string | null
  moodSlug: string | null
  occasionSlug: string | null
}): SearchQuery {
  return {
    keyword: keywordSchema.safeParse(input.keyword).data ?? null,
    areaCode: areaCodeSchema.safeParse(input.areaCode).data ?? null,
    moodSlug: tagSlugSchema.safeParse(input.moodSlug).data ?? null,
    occasionSlug: tagSlugSchema.safeParse(input.occasionSlug).data ?? null,
  }
}

export const loadMoreSearchSchema = z.object({
  query: searchQuerySchema,
  cursor: feedCursorSchema,
})

export type SearchQuery = z.infer<typeof searchQuerySchema>
