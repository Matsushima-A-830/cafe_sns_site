import { OFFICIAL_FORMAT_LABELS } from '@/lib/constants/posts'
import { OFFICIAL_BADGE_LABEL, type OfficialMetadata } from '@/lib/posts/official-metadata'
import { formatPostDate } from '@/lib/utils/format-date'

/**
 * 公式投稿（幹C-2）のバッジ。色だけで区別しない — comment-list.tsx の
 * 「オーナー公式」バッジと同じ考え方で、ラベル文字を必ず入れる
 *   docs/design/wireframes/composer.md #S_POST_OFFICIAL
 */
export function OfficialBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
      {OFFICIAL_BADGE_LABEL}
    </span>
  )
}

function formatPrice(priceYen: number | null): string | null {
  return priceYen === null ? null : `¥${priceYen.toLocaleString('ja-JP')}`
}

/**
 * フォーマット別の構造化フィールド（価格・期限等）をカード/詳細に出す要約。
 * tip は追加項目が無いため何も出さない（本文がそのまま要約になる）
 */
export function OfficialSummary({ metadata }: { metadata: OfficialMetadata }) {
  switch (metadata.format) {
    case 'today_special':
      return (
        <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold">
            {OFFICIAL_FORMAT_LABELS.today_special}
          </span>
          <span className="font-bold">{metadata.menuName}</span>
          {formatPrice(metadata.priceYen) && (
            <span className="text-muted-foreground">{formatPrice(metadata.priceYen)}</span>
          )}
        </p>
      )
    case 'new_menu':
      return (
        <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold">
            {OFFICIAL_FORMAT_LABELS.new_menu}
          </span>
          <span className="font-bold">{metadata.menuName}</span>
          {formatPrice(metadata.priceYen) && (
            <span className="text-muted-foreground">{formatPrice(metadata.priceYen)}</span>
          )}
          <span className="text-muted-foreground">{formatPostDate(metadata.availableFrom)}〜</span>
        </p>
      )
    case 'closure':
      return (
        <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold">
            {metadata.closureType === 'closed' ? '臨時休業' : '営業時間変更'}
          </span>
          <span className="text-muted-foreground">
            {formatPostDate(metadata.startsOn)} 〜 {formatPostDate(metadata.endsOn)}
          </span>
        </p>
      )
    case 'tip':
      return null
  }
}
