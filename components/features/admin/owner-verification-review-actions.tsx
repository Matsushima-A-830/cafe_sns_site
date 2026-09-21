'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { resolveOwnerVerification } from '@/app/_actions/admin-owner-verifications'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { OWNER_VERIFICATION_DECISIONS } from '@/lib/constants/admin-owner-verifications'
import { errorMessage } from '@/lib/utils/error-messages'

type Decision = (typeof OWNER_VERIFICATION_DECISIONS)[number]['value']

/**
 * S_ADMIN_OWNER_REVIEW の判定ボタン。ReportReviewActions と同じ確認ダイアログ必須パターン。
 * 却下は review_notes が必須（申請者への却下理由として S_OWNER_PENDING に表示するため）
 *   docs/design/screen-flow.md #6-カフェ経営者フロー
 */
export function OwnerVerificationReviewActions({ verificationId }: { verificationId: string }) {
  const [notes, setNotes] = useState('')
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const notesRequired = pendingDecision === 'reject'
  const canConfirm = !notesRequired || notes.trim().length > 0

  function handleConfirm() {
    const decision = pendingDecision
    if (!decision || !canConfirm) return
    setError(null)

    startTransition(async () => {
      const result = await resolveOwnerVerification({
        verificationId,
        decision,
        reviewNotes: notes,
      })
      if (!result.ok) {
        setError(errorMessage(result.error))
        setPendingDecision(null)
        return
      }
      router.push('/admin/verifications')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="review-notes">
          審査メモ{pendingDecision === 'reject' ? '（却下理由・必須）' : '（任意）'}
        </Label>
        <Textarea
          id="review-notes"
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
        {OWNER_VERIFICATION_DECISIONS.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={item.value === 'reject' ? 'outline' : 'default'}
            disabled={isPending}
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
            {OWNER_VERIFICATION_DECISIONS.find((item) => item.value === pendingDecision)?.label}？
          </DialogTitle>
          <DialogDescription>この操作は取り消せません。</DialogDescription>

          {notesRequired && notes.trim().length === 0 && (
            <p className="text-sm text-danger" role="alert">
              却下理由を入力してください
            </p>
          )}

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
              disabled={isPending || !canConfirm}
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
