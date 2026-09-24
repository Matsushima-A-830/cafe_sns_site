'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { type BlockedUser, unblockUser } from '@/app/_actions/blocks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * ブロック中のユーザー一覧（S_BLOCKED_USERS）。解除は誤操作防止のため
 * 確認ダイアログを必須にする（DraftList の削除確認と同じ方針）
 *   docs/design/wireframes/mypage.md #S_BLOCKED_USERS
 */
export function BlockedUserList({ initialUsers }: { initialUsers: BlockedUser[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [pendingUnblock, setPendingUnblock] = useState<BlockedUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleConfirmUnblock() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    const target = pendingUnblock
    if (!target) return

    // 楽観更新: 失敗時に元に戻すため直前の一覧を保持
    const previous = users
    setUsers((current) => current.filter((user) => user.id !== target.id))
    setPendingUnblock(null)
    setError(null)

    startTransition(async () => {
      const result = await unblockUser({ targetUserId: target.id })
      if (!result.ok) {
        setUsers(previous)
        setError(errorMessage(result.error))
        return
      }
      setStatus('ブロックを解除しました')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {users.length === 0 ? (
        <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
          ブロック中のユーザーはいません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((user) => {
            const avatarUrl =
              user.avatarUrl && isStoragePublicUrl(user.avatarUrl) ? user.avatarUrl : null

            return (
              <li
                key={user.id}
                className="flex items-center gap-3 rounded-lg border border-border-default bg-surface p-4"
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-base text-muted-foreground"
                  >
                    {user.displayName.slice(0, 1)}
                  </span>
                )}

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-bold text-foreground">
                    {user.displayName}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">@{user.username}</span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
                  // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
                  // 連打は handleConfirmUnblock 側の isPending ガードで止める
                  aria-busy={isPending}
                  onClick={() => setPendingUnblock(user)}
                  className="focus-visible:ring-2 focus-visible:ring-ring-focus"
                >
                  解除
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        ブロックすると、相手はあなたの投稿・プロフィールを見られなくなります。
      </p>

      <p aria-live="polite" className="sr-only">
        {isPending ? '解除中' : status}
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Dialog
        open={pendingUnblock !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUnblock(null)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>{pendingUnblock?.displayName}さんのブロックを解除しますか？</DialogTitle>
          <DialogDescription>
            解除すると、相手は再びあなたの投稿・プロフィールを見られるようになります。
          </DialogDescription>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setPendingUnblock(null)}
            >
              解除しない
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
              // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
              // 連打は handleConfirmUnblock 側の isPending ガードで止める
              aria-busy={isPending}
              onClick={handleConfirmUnblock}
            >
              解除する
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
