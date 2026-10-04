'use client'

import Image from 'next/image'
import { useEffect, useState, useTransition } from 'react'
import { awardRegular, revokeRegular, updateRegularNote } from '@/app/_actions/regular-customers'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { RegularCandidate, RegularCustomer } from '@/lib/owner/regulars'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'
import { formatPostDate, formatRelativeTime } from '@/lib/utils/format-date'
import { useDeferredRefresh } from '@/lib/utils/use-deferred-refresh'

/**
 * S_OWNER_REGULARS の3タブ（常連 / 認定候補 / 認定履歴）。
 * データはサーバーで取り切って渡し、操作後は router.refresh() でサーバーの
 * 最新状態を取り直す（このプロジェクトは revalidatePath を使わない方針。
 * app/_actions/cafe-business-hours.ts 等と同じ）
 *   docs/design/wireframes/owner.md #S_OWNER_REGULARS
 */

type Tab = 'active' | 'candidates' | 'history'

const TABS: { key: Tab; label: string }[] = [
  { key: 'active', label: '常連' },
  { key: 'candidates', label: '認定候補' },
  { key: 'history', label: '認定履歴' },
]

function Avatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) {
  const url = avatarUrl && isStoragePublicUrl(avatarUrl) ? avatarUrl : null
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-base text-muted-foreground"
    >
      {displayName.slice(0, 1)}
    </span>
  )
}

/**
 * formatRelativeTime は引数無しだと new Date() を使うため、SSR時とhydrate時で
 * 計算結果がずれてハイドレーションミスマッチを起こしうる（D44と同じ罠）。
 * マウント後にだけ相対時刻を計算し、初期描画は安定した日付表示にする
 */
function LastActivityLabel({ isoString }: { isoString: string }) {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    setLabel(formatRelativeTime(isoString))
  }, [isoString])

  return <>{label ?? formatPostDate(isoString)}</>
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface p-4">
      {children}
    </li>
  )
}

export function RegularsView({
  cafeId,
  cafeName,
  initialActiveRegulars,
  initialCandidates,
  initialHistory,
}: {
  cafeId: string
  cafeName: string
  initialActiveRegulars: RegularCustomer[]
  initialCandidates: RegularCandidate[]
  initialHistory: RegularCustomer[]
}) {
  const [tab, setTab] = useState<Tab>('active')

  return (
    <section className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="常連さん管理の切り替え"
        className="flex gap-6 border-b border-border-default"
      >
        {TABS.map(({ key, label }) => {
          const isActive = key === tab
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`regulars-tab-${key}`}
              aria-selected={isActive}
              aria-controls={`regulars-panel-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px border-b-2 px-2 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
                isActive
                  ? 'border-primary font-bold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id="regulars-panel-active"
        aria-labelledby="regulars-tab-active"
        hidden={tab !== 'active'}
      >
        <ActiveRegularsTab cafeId={cafeId} regulars={initialActiveRegulars} />
      </div>

      <div
        role="tabpanel"
        id="regulars-panel-candidates"
        aria-labelledby="regulars-tab-candidates"
        hidden={tab !== 'candidates'}
      >
        <CandidatesTab cafeId={cafeId} cafeName={cafeName} candidates={initialCandidates} />
      </div>

      <div
        role="tabpanel"
        id="regulars-panel-history"
        aria-labelledby="regulars-tab-history"
        hidden={tab !== 'history'}
      >
        <HistoryTab history={initialHistory} />
      </div>
    </section>
  )
}

function ActiveRegularsTab({ cafeId, regulars }: { cafeId: string; regulars: RegularCustomer[] }) {
  if (regulars.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">まだ常連さんがいません</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {regulars.map((regular) => (
        <RegularCard key={regular.userId} cafeId={cafeId} regular={regular} />
      ))}
    </ul>
  )
}

function RegularCard({ cafeId, regular }: { cafeId: string; regular: RegularCustomer }) {
  const requestRefresh = useDeferredRefresh()
  const [noteOpen, setNoteOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [note, setNote] = useState(regular.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSaveNote() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const result = await updateRegularNote({ cafeId, userId: regular.userId, note })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setNoteOpen(false)
      requestRefresh()
    })
  }

  function handleRevoke() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const result = await revokeRegular({ cafeId, userId: regular.userId })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setRevokeOpen(false)
      requestRefresh()
    })
  }

  return (
    <CardShell>
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={regular.avatarUrl} displayName={regular.displayName} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-bold text-foreground">
            {regular.displayName}
          </span>
          <span className="text-sm text-muted-foreground">
            認定: {formatPostDate(regular.awardedAt)}
          </span>
        </div>
      </div>
      {regular.note && <p className="text-sm text-foreground">メモ: {regular.note}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setNoteOpen(true)}>
          メモ編集
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setRevokeOpen(true)}>
          取消
        </Button>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogTitle>メモを編集</DialogTitle>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            aria-label="メモ"
          />
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                キャンセル
              </Button>
            </DialogClose>
            {/* 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。連打は handleSaveNote 側の isPending ガードで止める */}
            <Button type="button" aria-busy={isPending} onClick={handleSaveNote}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>認定を取り消しますか？</DialogTitle>
          <DialogDescription>ユーザーには通知されません。履歴には残ります。</DialogDescription>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="lg">
                キャンセル
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
              // 連打は handleRevoke 側の isPending ガードで止める
              aria-busy={isPending}
              onClick={handleRevoke}
            >
              取消する
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </CardShell>
  )
}

function CandidatesTab({
  cafeId,
  cafeName,
  candidates,
}: {
  cafeId: string
  cafeName: string
  candidates: RegularCandidate[]
}) {
  if (candidates.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        現在、認定候補のユーザーはいません
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {candidates.map((candidate) => (
        <CandidateCard
          key={candidate.userId}
          cafeId={cafeId}
          cafeName={cafeName}
          candidate={candidate}
        />
      ))}
    </ul>
  )
}

function CandidateCard({
  cafeId,
  cafeName,
  candidate,
}: {
  cafeId: string
  cafeName: string
  candidate: RegularCandidate
}) {
  const requestRefresh = useDeferredRefresh()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAward() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const result = await awardRegular({ cafeId, userId: candidate.userId, note })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setOpen(false)
      requestRefresh()
    })
  }

  return (
    <CardShell>
      <div className="flex items-center gap-3">
        <Avatar avatarUrl={candidate.avatarUrl} displayName={candidate.displayName} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-bold text-foreground">
            {candidate.displayName}
          </span>
          <span className="text-sm text-muted-foreground">
            投稿 {candidate.postCount} · コメント {candidate.commentCount} · 保存{' '}
            {candidate.bookmarkCount}
          </span>
          {candidate.lastActivityAt && (
            <span className="text-sm text-muted-foreground">
              最終投稿: <LastActivityLabel isoString={candidate.lastActivityAt} />
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          常連認定 ▶
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{candidate.displayName} を常連認定しますか？</DialogTitle>
          <DialogDescription>
            認定すると、ユーザーの「行きつけ」一覧に{cafeName}
            が強調表示されます。ユーザーには通知が届きます。
          </DialogDescription>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="一言メモ（任意）例: いつもありがとうございます"
            aria-label="一言メモ（任意）"
          />
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                キャンセル
              </Button>
            </DialogClose>
            {/* 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。連打は handleAward 側の isPending ガードで止める */}
            <Button type="button" aria-busy={isPending} onClick={handleAward}>
              認定する
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </CardShell>
  )
}

function HistoryTab({ history }: { history: RegularCustomer[] }) {
  if (history.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">認定履歴はまだありません</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {history.map((entry) => (
        <CardShell key={entry.userId}>
          <div className="flex items-center gap-3">
            <Avatar avatarUrl={entry.avatarUrl} displayName={entry.displayName} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base font-bold text-foreground">
                {entry.displayName}
              </span>
              <span className="text-sm text-muted-foreground">
                認定: {formatPostDate(entry.awardedAt)}
                {entry.revokedAt && ` / 取消: ${formatPostDate(entry.revokedAt)}`}
              </span>
            </div>
            {!entry.revokedAt && (
              <span className="ml-auto shrink-0 rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
                認定中
              </span>
            )}
          </div>
        </CardShell>
      ))}
    </ul>
  )
}
