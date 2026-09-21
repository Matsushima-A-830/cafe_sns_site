/**
 * S_ADMIN_OWNER_REVIEW の選択肢と UI ラベルの対応
 *   docs/design/screen-flow.md #6-カフェ経営者フロー
 *   docs/architecture/data-model/tables.md #cafe_owner_verifications
 */
export const OWNER_VERIFICATION_STATUS_LABELS = {
  pending: '審査中',
  approved: '承認済',
  rejected: '却下',
  withdrawn: '取り下げ',
} as const

export const OWNER_VERIFICATION_DECISIONS = [
  { value: 'approve', label: '承認する' },
  { value: 'reject', label: '却下する' },
] as const
