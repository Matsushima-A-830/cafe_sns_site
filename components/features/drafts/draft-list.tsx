'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type DraftSummary, deleteDraft, type LoadedDraft } from '@/app/_actions/drafts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { draftPostTypeLabel, draftPreviewText, draftResumeHref } from '@/lib/composer/draft-summary'
import { errorMessage } from '@/lib/utils/error-messages'
import { formatPostDate } from '@/lib/utils/format-date'

/**
 * 下書き一覧（S_DRAFTS）。削除は取り返しがつかないので確認ダイアログを必須にする
 * （損失回避。カフェリストの「外す」と扱いを分けている）
 *   docs/design/wireframes/mypage.md #S_DRAFTS
 */
export function DraftList({ initialDrafts }: { initialDrafts: DraftSummary[] }) {
  const [drafts, setDrafts] = useState(initialDrafts)
  const [pendingDelete, setPendingDelete] = useState<DraftSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleConfirmDelete() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    const target = pendingDelete
    if (!target) return

    // 楽観更新: 失敗時に元に戻すため直前の一覧を保持
    const previous = drafts
    setDrafts((current) =>
      current.filter((draft) => draft.clientDraftKey !== target.clientDraftKey),
    )
    setPendingDelete(null)
    setError(null)

    startTransition(async () => {
      const result = await deleteDraft({ clientDraftKey: target.clientDraftKey })
      if (!result.ok) {
        setDrafts(previous)
        setError(errorMessage(result.error))
        return
      }
      setStatus('下書きを削除しました')
      router.refresh()
    })
  }

  if (drafts.length === 0) {
    return (
      <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
        下書きはありません。書きかけの投稿は15秒ごとに自動保存され、ここに並びます。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {drafts.map((draft) => {
          // 形式不明（payload のバージョン不一致）の下書きは再開できない
          const resumable: LoadedDraft | null = draft.stale ? null : draft

          return (
            <li
              key={draft.clientDraftKey}
              className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="text-base break-words text-foreground">
                  {resumable ? draftPreviewText(resumable) : '古い形式の下書き（再開できません）'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {resumable ? `${draftPostTypeLabel(resumable)} ・ ` : ''}
                  最終保存: {formatPostDate(draft.lastSavedAt)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {resumable && (
                  <Button asChild size="sm">
                    <Link
                      href={draftResumeHref(resumable)}
                      className="focus-visible:ring-2 focus-visible:ring-ring-focus"
                    >
                      続きを書く
                    </Link>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
                  // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
                  // 他の下書きの削除中に開かせないためのガードは onClick 側に置く
                  aria-busy={isPending}
                  onClick={() => {
                    if (isPending) return
                    setPendingDelete(draft)
                  }}
                  className="focus-visible:ring-2 focus-visible:ring-ring-focus"
                >
                  削除
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {/* 損失予告。30日で expire する（pending-items A6 の日次削除待ちだが、
          取得時にも expires_at で絞っているので一覧からは期限切れ後すぐ消える） */}
      <p className="text-sm text-muted-foreground">
        下書きは最終保存から30日後に自動削除されます。
      </p>

      <p aria-live="polite" className="sr-only">
        {isPending ? '削除中' : status}
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>この下書きを削除しますか？</DialogTitle>
          <DialogDescription>
            削除すると元に戻せません。書きかけの内容は失われます。
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setPendingDelete(null)}
            >
              削除しない
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
              // 連打は handleConfirmDelete 側の isPending ガードで止める
              aria-busy={isPending}
              onClick={handleConfirmDelete}
            >
              削除する
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
