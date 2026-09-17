'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { reportCongestion } from '@/app/_actions/congestion'
import { Button } from '@/components/ui/button'
import {
  CONGESTION_LABELS,
  CONGESTION_LEVELS,
  type CongestionSummary,
  congestionLabel,
  congestionLevel,
} from '@/lib/cafes/congestion'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * 混雑度の表示と報告。直近30分（recent）→ 過去4週間の同時間帯（historical）→ データなしの
 * 3状態を出し分ける。報告後は集計をサーバーの返り値で置き換える（自分の1件だけでは
 * 平均を計算できない）
 *   docs/design/wireframes/browsing.md #S_CAFE_DETAIL
 */

const LEVELS = Array.from({ length: CONGESTION_LEVELS }, (_, index) => index + 1)

/** 5段階のインジケータ。色だけで伝えず必ずテキストを添える（CLAUDE.md アクセシビリティ） */
function CongestionMeter({ level, label }: { level: number; label: string }) {
  return (
    <p className="flex items-center gap-3">
      <span aria-hidden="true" className="flex items-center gap-1">
        {LEVELS.map((value) => (
          <span
            key={value}
            className={`size-3 rounded-full ${value <= level ? 'bg-primary' : 'bg-muted'}`}
          />
        ))}
      </span>
      <span className="text-base font-bold text-foreground">{label}</span>
    </p>
  )
}

function SummaryBody({ summary }: { summary: CongestionSummary }) {
  const level = congestionLevel(summary.levelAvg)
  const label = congestionLabel(summary.levelAvg)

  if (level === null || label === null) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-base text-foreground">まだ混雑度情報がありません</p>
        <p className="text-sm text-muted-foreground">最初の報告者になりませんか？</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-muted-foreground">
        {summary.source === 'recent' ? '今の混雑度' : 'いつも今頃はこんな感じ'}
      </p>
      <CongestionMeter level={level} label={label} />
      <p className="text-sm text-muted-foreground">
        {summary.source === 'recent'
          ? `直近30分のレポート ${summary.sampleCount}件`
          : `過去4週間の同じ時間帯 ${summary.sampleCount}件より`}
      </p>
    </div>
  )
}

export function CongestionSection({
  cafeId,
  initialSummary,
  isAuthenticated,
}: {
  cafeId: string
  initialSummary: CongestionSummary
  isAuthenticated: boolean
}) {
  const [summary, setSummary] = useState(initialSummary)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleReport(level: number) {
    // 楽観更新: 失敗時に戻すため直前の集計を保持する
    const previous = summary
    setSummary({ source: 'recent', levelAvg: level, sampleCount: previous.sampleCount + 1 })
    setError(null)

    startTransition(async () => {
      const result = await reportCongestion({ cafeId, level })
      if (!result.ok) {
        setSummary(previous)
        setError(errorMessage(result.error))
        return
      }
      // 他人の報告も混ざった平均に置き換える
      setSummary(result.data)
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">混雑度</h2>

      <div className="flex flex-col gap-4 rounded-lg border border-border-default bg-surface p-4">
        <SummaryBody summary={summary} />

        {/* 集計の更新はスクリーンリーダーにも伝える */}
        <p aria-live="polite" className="sr-only">
          {isPending ? '報告中' : (congestionLabel(summary.levelAvg) ?? '混雑度の情報はありません')}
        </p>

        {isAuthenticated ? (
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="text-sm text-muted-foreground">今の混雑度を報告する</legend>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleReport(level)}
                  className="focus-visible:ring-2 focus-visible:ring-ring-focus"
                >
                  {CONGESTION_LABELS[level]}
                </Button>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/login?next=${encodeURIComponent(`/cafes/${cafeId}`)}`}
              className="text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus"
            >
              ログイン
            </Link>
            すると混雑度を報告できます。
          </p>
        )}

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
