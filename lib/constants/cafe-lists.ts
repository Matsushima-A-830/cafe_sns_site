/**
 * user_cafe_lists.list_type。CHECK 制約（user_cafe_lists_list_type_check）と対にする
 *   docs/glossary.md お気に入り=favorite / 行きたい=want_to_go
 */
export const CAFE_LIST_TYPES = ['favorite', 'want_to_go'] as const

export type CafeListType = (typeof CAFE_LIST_TYPES)[number]

/** 日本語UIの表記。glossary の対応を1箇所に集約し、画面ごとに言い換えない */
export const CAFE_LIST_LABELS: Record<CafeListType, string> = {
  favorite: 'お気に入り',
  want_to_go: '行きたい',
}

/** 一覧画面（S_FAVORITES / S_WANT_TO_GO）のパス */
export const CAFE_LIST_PATHS: Record<CafeListType, string> = {
  favorite: '/me/favorites',
  want_to_go: '/me/want-to-go',
}
