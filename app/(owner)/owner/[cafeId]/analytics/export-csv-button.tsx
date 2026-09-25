'use client'

import { useState, useTransition } from 'react'
import { exportCafeAnalyticsCsv } from '@/app/_actions/owner-analytics'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * S_OWNER_ANALYTICS の「CSVでダウンロード」。Blob + createObjectURL で
 * クライアント側にファイルを生成する（Server Action は文字列を返すのみ）
 */
export function ExportCsvButton({ cafeId, weeks }: { cafeId: string; weeks: number }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）。二重クリックで
    // Blob/ダウンロードリンクが二重生成されるのを防ぐ
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const result = await exportCafeAnalyticsCsv({ cafeId, weeks })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }

      const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.data.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。連打は handleClick 側の isPending ガードで止める */}
      <Button type="button" variant="outline" onClick={handleClick} aria-busy={isPending}>
        {isPending ? 'ダウンロード準備中…' : 'CSVでダウンロード'}
      </Button>
      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
