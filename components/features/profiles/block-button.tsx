'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { blockUser } from '@/app/_actions/blocks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * 公開プロフィールからのブロック。ブロック後は is_blocked_either_way が真になり
 * この画面自体が次回から404になるため、その場に留まらずホームへ送る
 *   docs/design/wireframes/browsing.md #S_USER_PROFILE_PUBLIC
 *
 * 「⋯」メニュー（通報を含む）はスコープ外。最小限のブロック導線だけをここに置く
 */
export function BlockButton({ targetUserId }: { targetUserId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleConfirm() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    setError(null)
    startTransition(async () => {
      const result = await blockUser({ targetUserId })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setOpen(false)
      router.push('/')
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="focus-visible:ring-2 focus-visible:ring-ring-focus"
      >
        ブロック
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>このユーザーをブロックしますか？</DialogTitle>
          <DialogDescription>
            ブロックすると、相手はあなたの投稿・プロフィールを見られなくなります。解除は設定からいつでもできます。
          </DialogDescription>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
              ブロックしない
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
              ブロックする
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
