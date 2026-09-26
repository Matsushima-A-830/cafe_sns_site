'use client'

import type { NearbyCafe } from '@/lib/cafes/nearby'
import { cn } from '@/lib/utils/cn'
import { estimateWalkMinutes } from '@/lib/utils/walking-time'

export function CafeList({
  cafes,
  selectedCafeId,
  onSelect,
}: {
  cafes: NearbyCafe[]
  selectedCafeId: string | null
  onSelect: (cafeId: string) => void
}) {
  if (cafes.length === 0) {
    return (
      <p className="rounded-md border border-border-default bg-surface p-4 text-sm text-muted-foreground">
        条件に合うカフェが見つかりませんでした。絞り込みを変えてみてください。
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {cafes.map((cafe) => (
        <li key={cafe.cafeId}>
          <button
            type="button"
            onClick={() => onSelect(cafe.cafeId)}
            aria-pressed={cafe.cafeId === selectedCafeId}
            className={cn(
              'flex w-full flex-col gap-1 rounded-md border p-3 text-left transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring-focus',
              cafe.cafeId === selectedCafeId
                ? 'border-primary bg-surface'
                : 'border-border-default bg-surface hover:bg-muted',
            )}
          >
            <span className="font-bold text-foreground">{cafe.name}</span>
            <span className="text-sm text-muted-foreground">
              {cafe.areaLabel ?? 'エリア未設定'} ・ 徒歩{estimateWalkMinutes(cafe.distanceM)}分
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
