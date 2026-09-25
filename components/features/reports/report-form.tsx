'use client'

import Link from 'next/link'
import { useId, useState, useTransition } from 'react'
import { blockUser } from '@/app/_actions/blocks'
import { createReport } from '@/app/_actions/reports'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { REPORT_REASONS } from '@/lib/constants/reports'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'
import type { CreateReportInput } from '@/lib/validators/reports'

type ReportReason = CreateReportInput['reason']
type TargetType = CreateReportInput['targetType']

type Props = {
  targetType: TargetType
  targetId: string
  targetLabel: string
  backHref: string
}

/**
 * S_REPORT_FORM。送信後は別ルートに飛ばさず、同じページ内で完了画面に切り替える
 *   docs/design/wireframes/composer.md #S_REPORT_FORM
 */
export function ReportForm({ targetType, targetId, targetLabel, backHref }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [blockableUserId, setBlockableUserId] = useState<string | null | undefined>(undefined)
  const reasonLabelId = useId()

  const submitted = blockableUserId !== undefined

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (!reason || isPending) return
    setError(null)

    startTransition(async () => {
      const result = await createReport({
        targetType,
        targetId,
        reason,
        description: description.trim() || undefined,
      })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setBlockableUserId(result.data.blockableUserId)
    })
  }

  if (submitted) {
    return <ReportDone blockableUserId={blockableUserId} backHref={backHref} />
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <p className="text-base text-foreground">
        対象: <span className="font-bold">{targetLabel}</span>
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend id={reasonLabelId} className="text-base font-bold text-foreground">
          理由を選択してください
        </legend>
        <div role="radiogroup" aria-labelledby={reasonLabelId} className="flex flex-col gap-2">
          {REPORT_REASONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'cursor-pointer rounded-lg border px-4 py-3 text-base transition-colors',
                'border-border-default bg-surface text-foreground hover:bg-muted',
                'has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:hover:bg-primary',
                'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring-focus',
              )}
            >
              <input
                type="radio"
                name="report-reason"
                className="sr-only"
                checked={reason === option.value}
                // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
                // 二重送信は handleSubmit 側の isPending ガードで止める
                aria-busy={isPending}
                onChange={() => setReason(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="report-description" className="text-base font-bold text-foreground">
          補足説明（省略可能）
        </label>
        <Textarea
          id="report-description"
          value={description}
          // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
          // 二重送信は handleSubmit 側の isPending ガードで止める
          aria-busy={isPending}
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        ※ 通報は運営で確認します。結果は通知でお知らせします。
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert" aria-live="polite">
          {error}
        </p>
      )}

      {/* 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。二重送信は handleSubmit 側の isPending ガードで止める */}
      <Button type="submit" size="lg" disabled={!reason} aria-busy={isPending}>
        通報する
      </Button>
    </form>
  )
}

function ReportDone({
  blockableUserId,
  backHref,
}: {
  blockableUserId: string | null
  backHref: string
}) {
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBlock() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (!blockableUserId || isPending) return
    setError(null)
    startTransition(async () => {
      const result = await blockUser({ targetUserId: blockableUserId })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setBlocked(true)
    })
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center" aria-live="polite">
      <span aria-hidden="true" className="text-4xl text-primary">
        ✓
      </span>
      <h1 className="text-xl font-bold text-foreground">通報を受け付けました</h1>
      <p className="text-base text-muted-foreground">
        運営で確認のうえ対応します。結果は通知でお知らせします。
      </p>

      {blockableUserId && !blocked && (
        <div className="flex w-full max-w-xs flex-col items-center gap-3 pt-4">
          <p className="text-base text-foreground">該当ユーザーをブロックしますか？</p>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex w-full flex-col gap-2">
            <Button
              type="button"
              variant="destructive"
              size="lg"
              // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
              // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
              // 連打は handleBlock 側の isPending ガードで止める
              aria-busy={isPending}
              onClick={handleBlock}
            >
              ブロックする
            </Button>
            <Button type="button" variant="outline" size="lg" asChild>
              <Link href={backHref}>しない</Link>
            </Button>
          </div>
        </div>
      )}

      {blockableUserId && blocked && <p className="text-base text-foreground">ブロックしました</p>}

      {(!blockableUserId || blocked) && (
        <Button type="button" variant="outline" size="lg" asChild className="mt-4">
          <Link href={backHref}>戻る</Link>
        </Button>
      )}
    </div>
  )
}
