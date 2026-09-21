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

/**
 * posts.official_format の取りうる値（S_POST_OFFICIAL、幹C-2）。
 *   docs/design/wireframes/composer.md #S_POST_OFFICIAL
 *   docs/architecture/data-model/tables.md #metadataのスキーマ公式投稿
 */
export const OFFICIAL_FORMATS = ['today_special', 'tip', 'closure', 'new_menu'] as const

export type OfficialFormat = (typeof OFFICIAL_FORMATS)[number]

export function isOfficialFormat(value: string): value is OfficialFormat {
  return (OFFICIAL_FORMATS as readonly string[]).includes(value)
}

/**
 * フォーマットごとの post_type 割り当て（着手前の要判断③、推奨案で決定）。
 * 豆知識(tip)はTiptap長文本体を持つため blog、他3つは画像+短文+metadata中心の
 * 構造化フォーマットなので short に寄せる。tables.md に明記する前提の暫定決定
 */
export function officialFormatPostType(format: OfficialFormat): 'short' | 'blog' {
  return format === 'tip' ? 'blog' : 'short'
}

export const OFFICIAL_FORMAT_LABELS: Record<OfficialFormat, string> = {
  today_special: '今日のおすすめ',
  tip: '豆知識',
  closure: '臨時休業・営業時間変更',
  new_menu: '新メニュー',
}
