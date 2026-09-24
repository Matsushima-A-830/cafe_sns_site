'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { withdrawClaim } from '@/app/_actions/owner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { OwnerVerificationWithCafe } from '@/lib/owner/verification'
import { errorMessage } from '@/lib/utils/error-messages'
import { formatPostDate } from '@/lib/utils/format-date'

type Props = { verification: OwnerVerificationWithCafe }

const STATUS_LABEL: Record<OwnerVerificationWithCafe['status'], string> = {
  pending: '審査中です',
  approved: '承認されました',
  rejected: '申請が却下されました',
  withdrawn: '申請を取り下げました',
}

/**
 * S_OWNER_PENDING。却下時は理由 + 再申請導線、pending時のみ取り下げボタンを出す
 *   docs/design/wireframes/owner.md #s_owner_pending審査中
 */
export function OwnerPendingView({ verification }: Props) {
  const [status, setStatus] = useState(verification.status)
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleWithdraw() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    setError(null)
    setConfirmingWithdraw(false)

    startTransition(async () => {
      const result = await withdrawClaim({ verificationId: verification.id })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setStatus('withdrawn')
    })
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <span aria-hidden="true" className="text-4xl">
        {status === 'pending' ? '⏳' : status === 'rejected' ? '⚠' : '✓'}
      </span>
      <h1 className="text-xl font-bold text-foreground" aria-live="polite">
        {STATUS_LABEL[status]}
      </h1>

      <div className="flex flex-col gap-1 text-base text-foreground">
        <p>{verification.cafe.name}</p>
        <p className="text-sm text-muted-foreground">
          申請日: {formatPostDate(verification.createdAt)}
        </p>
      </div>

      {status === 'pending' && (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">
            通常3〜5営業日で結果をお知らせします。審査結果は通知でお伝えします。
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            審査中も店舗情報の閲覧はできますが、編集・分析はまだご利用いただけません。
          </p>
        </>
      )}

      {status === 'rejected' && (
        <div className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-danger bg-danger/10 p-4 text-left">
          <p className="text-sm text-foreground">
            理由: {verification.reviewNotes ?? '（理由の記載なし）'}
          </p>
          <p className="text-sm text-foreground">追加書類を提出して再申請できます。</p>
          <Button type="button" size="lg" asChild>
            <Link href={`/owner/claim/${verification.cafe.id}`}>再申請する</Link>
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {status === 'pending' && (
        <div className="flex w-full max-w-sm flex-col gap-2 pt-4">
          <Button type="button" variant="outline" size="lg" asChild>
            <Link href={`/cafes/${verification.cafe.id}`}>申請内容を確認する</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
            // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
            // 連打は handleWithdraw 側の isPending ガードで止める
            aria-busy={isPending}
            onClick={() => setConfirmingWithdraw(true)}
          >
            申請を取り下げる
          </Button>
        </div>
      )}

      {status === 'approved' && (
        <Button type="button" size="lg" asChild className="mt-4">
          <Link href={`/owner/${verification.cafe.id}`}>ダッシュボードへ進む</Link>
        </Button>
      )}

      {status === 'withdrawn' && (
        <Button type="button" variant="outline" size="lg" asChild className="mt-4">
          <Link href={`/cafes/${verification.cafe.id}`}>カフェページに戻る</Link>
        </Button>
      )}

      <Dialog open={confirmingWithdraw} onOpenChange={setConfirmingWithdraw}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>申請を取り下げますか？</DialogTitle>
          <DialogDescription>取り下げると、この申請は審査されなくなります。</DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setConfirmingWithdraw(false)}
            >
              取り下げない
            </Button>
            <Button type="button" variant="destructive" size="lg" onClick={handleWithdraw}>
              取り下げる
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
