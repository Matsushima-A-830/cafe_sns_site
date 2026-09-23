import type { EarnedBadge } from '@/lib/badges/earned'
import { getBadgeIcon } from '@/lib/badges/icons'

/**
 * S_USER_PROFILE_PUBLIC ヘッダー直下の「バッジ」横並びチップ。
 * BadgeTile（components/features/badges/badge-card.tsx）はカード型で場所を取りすぎるため、
 * ワイヤー（docs/design/wireframes/browsing.md #S_USER_PROFILE_PUBLIC）の
 * 「バッジ [街歩き入門][朝カフェマスター]...」に合わせた小型チップとして別実装にする
 */

export function EarnedBadgeRow({ badges }: { badges: EarnedBadge[] }) {
  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-foreground">バッジ</span>
      <ul className="flex flex-wrap gap-2">
        {badges.map((badge) => {
          const Icon = getBadgeIcon(badge.code)
          return (
            <li key={badge.code}>
              <span className="flex items-center gap-1 rounded-full border border-border-default bg-surface px-3 py-1 text-sm text-foreground">
                <Icon aria-hidden="true" className="size-4 text-primary" />
                {badge.name}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
