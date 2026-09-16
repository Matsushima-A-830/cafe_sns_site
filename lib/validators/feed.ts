import { z } from 'zod'
import { usernameSchema } from '@/lib/validators/onboarding'

/**
 * フィード（S_HOME / S_EXPLORE）の絞り込み条件。URL のクエリからも
 * 「もっと見る」の Server Action 経由でも同じ形で入ってくる
 */

export const FEED_SCOPES = ['recommended', 'new', 'following'] as const

// tags.slug は英小文字とハイフン、areas.code は ISO 3166-2 準拠で大文字と数字を含む
//   docs/seed/curated-tags-initial-set.md / docs/seed/areas-initial-set.md
const SLUG_PATTERN = /^[a-z0-9-]+$/
const AREA_CODE_PATTERN = /^[A-Za-z0-9-]+$/

const tagSlugSchema = z.string().max(60).regex(SLUG_PATTERN)
const areaCodeSchema = z.string().max(60).regex(AREA_CODE_PATTERN)

export const feedQuerySchema = z.object({
  scope: z.enum(FEED_SCOPES),
  tagSlug: tagSlugSchema.nullable().default(null),
  areaCode: areaCodeSchema.nullable().default(null),
  /**
   * S_USER_PROFILE_PUBLIC の投稿グリッド。他の絞り込みと違い「誰の投稿か」は
   * セッションから引けずクライアント入力になるので、形を Zod で検証したうえで
   * resolveFeedOptions が実在する active なユーザーかを確かめる
   */
  authorUsername: usernameSchema.nullable().default(null),
})

/**
 * URL のクエリ文字列から絞り込みを組み立てる。壊れた値は 404 にせずその項目だけ捨てる。
 * オブジェクトごと safeParse すると `?tag=&area=JP-13-shibuya-ku` のように片方が
 * 空なだけで、生きている方の絞り込みまで一緒に消えてしまう
 */
export function parseFeedQuery(input: {
  scope: FeedScope
  tagSlug: string | null
  areaCode: string | null
}): FeedQuery {
  return {
    scope: input.scope,
    tagSlug: tagSlugSchema.safeParse(input.tagSlug).data ?? null,
    areaCode: areaCodeSchema.safeParse(input.areaCode).data ?? null,
    // URL クエリからは受け取らない。作者の絞り込みはルートパラメータ由来のものだけ
    // （壊れた値を null に丸める上の方式だと、絞り込みが外れて全件になってしまう）
    authorUsername: null,
  }
}

/**
 * keyset カーソル。publishedAt は PostgREST が返した timestamptz をそのまま往復させる
 * （マイクロ秒を落とすと未表示の投稿がページ送りから消える — lib/posts/post-list.ts 参照）
 */
export const feedCursorSchema = z.object({
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/),
  id: z.string().uuid(),
})

export const loadMoreFeedSchema = z.object({
  query: feedQuerySchema,
  cursor: feedCursorSchema,
})

export type FeedQuery = z.infer<typeof feedQuerySchema>
export type FeedScope = (typeof FEED_SCOPES)[number]
