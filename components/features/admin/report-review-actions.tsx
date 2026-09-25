'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { resolveReport } from '@/app/_actions/admin-reports'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { REPORT_DECISIONS } from '@/lib/constants/admin-reports'
import { errorMessage } from '@/lib/utils/error-messages'

type Decision = (typeof REPORT_DECISIONS)[number]['value']

/**
 * S_ADMIN_REVIEW の判定ボタン。破壊的操作（非表示化・削除・停止）は
 * BlockButton と同じ確認ダイアログ必須パターンを踏襲する
 *   docs/design/screen-flow.md #5-通報ブロックフロー
 */
export function ReportReviewActions({
  reportId,
  targetType,
}: {
  reportId: string
  targetType: 'post' | 'comment' | 'user' | 'cafe'
}) {
  const [notes, setNotes] = useState('')
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const availableDecisions = REPORT_DECISIONS.filter(
    (item) => item.targetType === null || item.targetType === targetType,
  )

  function handleConfirm() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return
    const decision = pendingDecision
    if (!decision) return
    setError(null)

    startTransition(async () => {
      const result = await resolveReport({ reportId, decision, resolutionNotes: notes })
      if (!result.ok) {
        setError(errorMessage(result.error))
        setPendingDecision(null)
        return
      }
      router.push('/admin/reports')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="resolution-notes">対応メモ（任意）</Label>
        <Textarea
          id="resolution-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
        />
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {availableDecisions.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={item.value === 'reject' ? 'outline' : 'destructive'}
            // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
            // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
            // 連打は handleConfirm 側の isPending ガードで止める
            aria-busy={isPending}
            onClick={() => setPendingDecision(item.value)}
            className="focus-visible:ring-2 focus-visible:ring-ring-focus"
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Dialog
        open={pendingDecision !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDecision(null)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>
            {REPORT_DECISIONS.find((item) => item.value === pendingDecision)?.label}？
          </DialogTitle>
          <DialogDescription>この操作は取り消せません。</DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setPendingDecision(null)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
              // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
              // 連打は handleConfirm 側の isPending ガードで止める
              aria-busy={isPending}
              onClick={handleConfirm}
            >
              実行する
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
