/**
 * posts.status の取りうる値。DB 側は CHECK 制約で担保しており PG enum ではないため、
 * `supabase gen types` は string を吐く。アプリ側の比較を型で守るためここに集約する
 *   docs/architecture/data-model/tables.md #posts
 */
export const POST_STATUSES = ['published', 'archived', 'hidden'] as const

export type PostStatus = (typeof POST_STATUSES)[number]

export function isPostStatus(value: string): value is PostStatus {
  return (POST_STATUSES as readonly string[]).includes(value)
}
