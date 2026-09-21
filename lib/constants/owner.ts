/**
 * cafe_owner_verifications.document_urls[].type の選択肢と UI ラベルの対応（S_OWNER_CLAIM）
 *   docs/architecture/data-model/tables.md #cafe_owner_verifications
 *   docs/design/wireframes/owner.md #s_owner_claimオーナー認証申請
 */
export const OWNER_DOCUMENT_TYPES = [
  { value: 'business_license', label: '営業許可証（画像）' },
  { value: 'business_card_with_photo', label: '屋号入り名刺 + 店舗内で撮影した本人写真（2枚）' },
  { value: 'corporate_registry', label: '法人登記簿（法人経営の場合）' },
  { value: 'notification_of_business', label: '開業届（税務署受領印付き）' },
  { value: 'other', label: 'その他' },
] as const

/** 書類2点以上（error-catalog.md DOCUMENTS_INSUFFICIENT）。tables.md の CHECK 制約と一致させる */
export const OWNER_DOCUMENT_MIN_COUNT = 2
