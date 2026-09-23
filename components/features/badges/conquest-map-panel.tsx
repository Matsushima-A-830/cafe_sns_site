import { Check } from 'lucide-react'
import type { ConquestMapProgress } from '@/lib/badges/conquest-map'
import { cn } from '@/lib/utils/cn'

/**
 * 制覇マップ（簡易版）。実SVG地図ではなく東京23区の一覧+チェックマークで表示する
 * （docs/product/pending-items.md D59、決定済み）
 */
export function ConquestMapPanel({ progress }: { progress: ConquestMapProgress }) {
  const { wards, visitedCount, totalCount } = progress
  const rate = totalCount === 0 ? 0 : Math.round((visitedCount / totalCount) * 100)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">東京23区</h2>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {wards.map((ward) => (
          <li key={ward.code}>
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border border-border-default p-3',
                ward.visited ? 'bg-primary/10' : 'bg-muted/50',
              )}
            >
              {ward.visited ? (
                <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
              ) : (
                <span aria-hidden="true" className="size-4 shrink-0" />
              )}
              <span
                className={cn(
                  'truncate text-sm',
                  ward.visited ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {ward.label}
              </span>
              <span className="sr-only">{ward.visited ? '訪問済' : '未訪問'}</span>
            </div>
          </li>
        ))}
      </ul>

      <p className="rounded-lg border border-border-default bg-surface p-4 text-center text-base font-bold text-foreground">
        訪問済 {visitedCount} / {totalCount} エリア ({rate}%)
      </p>
    </div>
  )
}
