'use client'

import { useState, useTransition } from 'react'
import {
  type BackfillCafeLocationsResult,
  backfillCafeLocations,
} from '@/app/_actions/admin-cafe-locations'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils/error-messages'

const SKIP_REASON_LABELS: Record<BackfillCafeLocationsResult['skipped'][number]['reason'], string> =
  {
    NOT_FOUND: '住所からの座標特定に失敗',
    EXTERNAL_SERVICE_ERROR: 'Geocoding APIエラー',
    UPDATE_FAILED: 'DB更新に失敗',
  }

/**
 * S_ADMIN_NG_WORDS のNgWordManagerと同じ理由で、実行結果もこのコンポーネント内の
 * state で持つ（router.refresh() は初期件数の再取得にのみ使う）
 *   docs/product/pending-items.md #d63-s_map
 */
export function CafeLocationBackfill({ initialCount }: { initialCount: number }) {
  const [remaining, setRemaining] = useState(initialCount)
  const [result, setResult] = useState<BackfillCafeLocationsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRun() {
    if (isPending) return
    setError(null)

    startTransition(async () => {
      const response = await backfillCafeLocations()
      if (!response.ok) {
        setError(errorMessage(response.error))
        return
      }
      setResult(response.data)
      setRemaining((current) => Math.max(0, current - response.data.updated))
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface p-4">
      <p className="text-base text-foreground">座標未設定のカフェ: {remaining}件</p>

      <Button
        type="button"
        onClick={handleRun}
        disabled={remaining === 0}
        aria-busy={isPending}
        className="self-start"
      >
        {isPending ? '実行中…' : 'バックフィルを実行する'}
      </Button>

      <p aria-live="polite" className="sr-only">
        {isPending ? '処理中' : ''}
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-2 rounded-md border border-border-default bg-background p-4">
          <p className="text-sm text-foreground">
            対象 {result.processed}件中 {result.updated}件を更新しました
          </p>

          {result.skipped.length > 0 && (
            <ul className="flex flex-col gap-1">
              {result.skipped.map((item) => (
                <li key={item.cafeId} className="text-sm text-muted-foreground">
                  {item.name}: {SKIP_REASON_LABELS[item.reason]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
