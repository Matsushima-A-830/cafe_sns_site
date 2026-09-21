/**
 * S_ADMIN_REPORTS / S_ADMIN_REVIEW の選択肢と UI ラベルの対応。
 * status のラベルは docs/glossary.md #通報状態 のユビキタス言語と一致させる
 *   docs/design/screen-flow.md #5-通報ブロックフロー
 *   docs/architecture/data-model/tables.md #reports
 */
export const REPORT_STATUS_LABELS = {
  pending: '未対応',
  reviewing: '対応中',
  resolved: '対応済',
  rejected: '対応不要',
} as const

export const REPORT_TARGET_TYPE_LABELS = {
  post: '投稿',
  comment: 'コメント',
  user: 'ユーザー',
  cafe: 'カフェ',
} as const

/**
 * 判定アクション。target_type ごとに選べる対応が違う（cafe は却下のみ）
 *   pending-items D48
 */
export const REPORT_DECISIONS = [
  { value: 'hide_post', label: '投稿を非表示にする', targetType: 'post' },
  { value: 'delete_comment', label: 'コメントを削除する', targetType: 'comment' },
  { value: 'suspend_user', label: 'ユーザーを停止する', targetType: 'user' },
  { value: 'reject', label: '違反なし（却下）', targetType: null },
] as const
