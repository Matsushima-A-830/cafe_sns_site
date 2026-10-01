import { z } from 'zod'
import { usernameSchema } from '@/lib/validators/onboarding'

/**
 * フィード（S_HOME / S_EXPLORE）の絞り込み条件。URL のクエリからも
 * 「もっと見る」の Server Action 経由でも同じ形で入ってくる
 */

export const FEED_SCOPES = ['recommended', 'new', 'following', 'nearby'] as const

// tags.slug は英小文字とハイフン、areas.code は ISO 3166-2 準拠で大文字と数字を含む
//   docs/seed/curated-tags-initial-set.md / docs/seed/areas-initial-set.md
const SLUG_PATTERN = /^[a-z0-9-]+$/
const AREA_CODE_PATTERN = /^[A-Za-z0-9-]+$/

const tagSlugSchema = z.string().max(60).regex(SLUG_PATTERN)
const areaCodeSchema = z.string().max(60).regex(AREA_CODE_PATTERN)
const latSchema = z.number().min(-90).max(90)
const lngSchema = z.number().min(-180).max(180)

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
  /** S_CAFE_DETAIL の投稿グリッド。authorUsername と同じ理由でクライアント入力を検証する */
  cafeId: z.string().uuid().nullable().default(null),
  /** S_EXPLORE「近くのカフェ」タブの閲覧者座標。scope='nearby' のときだけ使う（pending-items D25） */
  lat: latSchema.nullable().default(null),
  lng: lngSchema.nullable().default(null),
})

/**
 * 範囲外・数値でない座標は null に丸める。tagSlug/areaCode と同じく、片方が
 * 壊れているからといってクエリ全体を捨てない（このフィールドは lat/lng で対）
 */
function parseCoordinate(value: string | null, schema: typeof latSchema): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = schema.safeParse(Number(value))
  return parsed.success ? parsed.data : null
}

/**
 * URL のクエリ文字列から絞り込みを組み立てる。壊れた値は 404 にせずその項目だけ捨てる。
 * オブジェクトごと safeParse すると `?tag=&area=JP-13-shibuya-ku` のように片方が
 * 空なだけで、生きている方の絞り込みまで一緒に消えてしまう
 */
export function parseFeedQuery(input: {
  scope: FeedScope
  tagSlug: string | null
  areaCode: string | null
  lat?: string | null
  lng?: string | null
}): FeedQuery {
  return {
    scope: input.scope,
    tagSlug: tagSlugSchema.safeParse(input.tagSlug).data ?? null,
    areaCode: areaCodeSchema.safeParse(input.areaCode).data ?? null,
    // URL クエリからは受け取らない。作者・カフェの絞り込みはルートパラメータ由来のものだけ
    // （壊れた値を null に丸める上の方式だと、絞り込みが外れて全件になってしまう）
    authorUsername: null,
    cafeId: null,
    lat: parseCoordinate(input.lat ?? null, latSchema),
    lng: parseCoordinate(input.lng ?? null, lngSchema),
  }
}

/**
 * keyset カーソル。publishedAt は PostgREST が返した timestamptz をそのまま往復させる
 * （マイクロ秒を落とすと未表示の投稿がページ送りから消える — lib/posts/post-list.ts 参照）。
 * matchCount は「おすすめ」タブ（一致タグ数順 — pending-items D24）のときだけ付く。
 * 他スコープではクライアントが受け取ったカーソルをそのまま返すだけなので、
 * optional にして共通の形にする（スコープごとにスキーマを分けない）
 */
export const feedCursorSchema = z.object({
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/),
  id: z.string().uuid(),
  matchCount: z.number().int().min(0).optional(),
})

export const loadMoreFeedSchema = z.object({
  query: feedQuerySchema,
  cursor: feedCursorSchema,
})

export type FeedQuery = z.infer<typeof feedQuerySchema>
export type FeedScope = (typeof FEED_SCOPES)[number]
