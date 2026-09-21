/**
 * reports.reason の選択肢と UI ラベルの対応（S_REPORT_FORM）
 *   docs/architecture/data-model/tables.md #reports
 */
export const REPORT_REASONS = [
  { value: 'spam', label: 'スパム / 宣伝' },
  { value: 'harassment', label: '嫌がらせ / 誹謗中傷' },
  { value: 'minor_risk', label: '未成年に不適切' },
  { value: 'copyright', label: '著作権侵害' },
  { value: 'privacy', label: '個人情報を含む' },
  { value: 'other', label: 'その他' },
] as const
