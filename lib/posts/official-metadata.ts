import { isOfficialFormat, type OfficialFormat } from '@/lib/constants/posts'

/**
 * posts.metadata（jsonb）の読み取り側の型。書き込み側の Zod スキーマ
 * （lib/validators/posts.ts）とキー名を揃える
 *   docs/architecture/data-model/tables.md #metadataのスキーマ公式投稿
 */
export type OfficialMetadata =
  | {
      format: 'today_special'
      menuName: string
      priceYen: number | null
      validUntil: string | null
    }
  | { format: 'new_menu'; menuName: string; priceYen: number | null; availableFrom: string }
  | {
      format: 'closure'
      closureType: 'closed' | 'hours_changed'
      startsOn: string
      endsOn: string
      reason: string
    }
  | { format: 'tip' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

/**
 * DB から読んだ official_format / metadata を表示用の型へ変換する。
 * 形が壊れている行（想定外の手動書き込み等）は null を返し、呼び出し側は
 * バッジだけ出して構造化フィールドを無視する — 一覧・詳細を丸ごと落とさないため
 */
export function toOfficialMetadata(
  officialFormat: string | null,
  metadata: unknown,
): OfficialMetadata | null {
  if (!officialFormat || !isOfficialFormat(officialFormat)) return null
  const raw = isRecord(metadata) ? metadata : {}

  switch (officialFormat) {
    case 'today_special': {
      const menuName = str(raw.menu_name)
      if (menuName === null) return null
      return {
        format: 'today_special',
        menuName,
        priceYen: numOrNull(raw.price_yen),
        validUntil: str(raw.valid_until),
      }
    }
    case 'new_menu': {
      const menuName = str(raw.menu_name)
      const availableFrom = str(raw.available_from)
      if (menuName === null || availableFrom === null) return null
      return {
        format: 'new_menu',
        menuName,
        priceYen: numOrNull(raw.price_yen),
        availableFrom,
      }
    }
    case 'closure': {
      const closureType = raw.closure_type === 'hours_changed' ? 'hours_changed' : 'closed'
      const startsOn = str(raw.starts_on)
      const endsOn = str(raw.ends_on)
      if (startsOn === null || endsOn === null) return null
      return {
        format: 'closure',
        closureType,
        startsOn,
        endsOn,
        reason: str(raw.reason) ?? '',
      }
    }
    case 'tip':
      return { format: 'tip' }
  }
}

export const OFFICIAL_BADGE_LABEL = '✓公式'

export type { OfficialFormat }
