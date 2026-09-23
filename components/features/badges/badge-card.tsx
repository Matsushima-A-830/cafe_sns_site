import { getBadgeIcon } from '@/lib/badges/icons'
import type { BadgeProgress } from '@/lib/badges/progress'
import { cn } from '@/lib/utils/cn'

/**
 * バッジ一覧のカード。獲得済み/ロック中はアイコン+名前のタイル、挑戦中は
 * 進捗バー付きの横長カードで表示を分ける（docs/design/wireframes/mypage.md #S_BADGES）
 */

// 進捗ドットは常に5段階固定なので、配列インデックスではなく固定キーで描画する
const PROGRESS_STEPS = [0, 1, 2, 3, 4] as const

export function BadgeTile({ badge, locked }: { badge: BadgeProgress; locked: boolean }) {
  const Icon = getBadgeIcon(badge.code)

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-border-default bg-surface p-4 text-center',
        locked && 'opacity-40',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-8', locked ? 'text-muted-foreground' : 'text-primary')}
      />
      <span className="line-clamp-2 text-sm text-foreground">{badge.name}</span>
      <span className="sr-only">{locked ? '未獲得' : '獲得済み'}</span>
    </div>
  )
}

export function BadgeProgressCard({ badge }: { badge: BadgeProgress }) {
  const Icon = getBadgeIcon(badge.code)
  const filledSteps = Math.min(5, Math.round((badge.current / badge.threshold) * 5))

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface p-4">
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="size-6 shrink-0 text-primary" />
        <span className="text-base font-bold text-foreground">{badge.name}</span>
      </div>

      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex gap-1">
          {PROGRESS_STEPS.map((step) => (
            <span
              key={step}
              className={cn(
                'size-2.5 rounded-full',
                step < filledSteps ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </span>
        <span className="text-sm text-muted-foreground">
          進捗 {badge.current}/{badge.threshold}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{badge.description}</p>
    </div>
  )
}
