/**
 * S_ADMIN_NG_WORDS の選択肢と UI ラベルの対応
 *   docs/architecture/data-model/tables.md #ng_words
 */
export const NG_WORD_SEVERITY_LABELS = {
  warn: '警告のみ（保存は妨げない）',
  block: 'ブロック（保存拒否）',
} as const

export const NG_WORD_CATEGORY_LABELS = {
  harassment: '嫌がらせ / 誹謗中傷',
  adult: 'アダルト',
  spam: 'スパム',
  other: 'その他',
} as const
