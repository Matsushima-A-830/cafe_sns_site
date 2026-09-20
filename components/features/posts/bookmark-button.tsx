'use client'

import { Bookmark } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { bookmarkPost, unbookmarkPost } from '@/app/_actions/bookmarks'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * 投稿の保存ボタン。カード（S_HOME / S_EXPLORE ほか）と投稿詳細で共有する。
 * LikeButton とほぼ同じ構造だが、ハートアイコン・「いいね」文言に強く結びついた
 * LikeButton を条件分岐で共通化すると読みにくくなるため新規コンポーネントにする
 *   docs/design/wireframes/mypage.md #S_MYPAGE
 */
export function BookmarkButton({
  postId,
  initialBookmarked,
  initialCount,
  isAuthenticated,
  returnTo,
  showLoginHint = false,
}: {
  postId: string
  initialBookmarked: boolean
  initialCount: number
  isAuthenticated: boolean
  /** 未ログインでログインへ送るときの戻り先 */
  returnTo: string
  /**
   * 未ログイン時にログイン導線まで出すか。カードが並ぶ一覧で12回繰り返すと
   * 表示も読み上げもうるさいので、既定では件数だけ出す（投稿詳細だけ true）
   */
  showLoginHint?: boolean
}) {
  // 楽観更新: 失敗時に元に戻すため直前の値を保持する
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [count, setCount] = useState(initialCount)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    const previousBookmarked = bookmarked
    const previousCount = count
    setBookmarked(!previousBookmarked)
    setCount(previousCount + (previousBookmarked ? -1 : 1))
    setError(null)

    startTransition(async () => {
      const result = previousBookmarked
        ? await unbookmarkPost({ postId })
        : await bookmarkPost({ postId })

      if (!result.ok) {
        setBookmarked(previousBookmarked)
        setCount(previousCount)
        setError(errorMessage(result.error))
        return
      }
      // 楽観更新の ±1 を確定値で上書きする。押した時点の表示が古いと（別タブで
      // 操作した・他人が保存した）ズレが残り、この state は props から
      // 1度しか初期化されないため router.refresh() でも直らない
      setCount(result.data.bookmarkCount)
      setStatus(previousBookmarked ? '保存を解除しました' : '保存しました')
      router.refresh()
    })
  }

  if (!isAuthenticated) {
    if (!showLoginHint) {
      return <p className="text-sm text-muted-foreground">保存 {initialCount}件</p>
    }
    // LikeButton と同じくモーダルではなくログインリンクにする（全画面で導線を揃える）
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?next=${encodeURIComponent(returnTo)}`}
          className="text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus"
        >
          ログイン
        </Link>
        すると保存できます（保存 {initialCount}件）
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        // 色だけで状態を伝えない。押下状態とラベルの両方で示す（ピークエンド則）
        aria-pressed={bookmarked}
        // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
        // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
        // 連打は handleClick 側の isPending ガードで止める
        aria-busy={isPending}
        onClick={handleClick}
        className={cn(
          'inline-flex w-fit items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
          bookmarked ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Bookmark
          aria-hidden="true"
          className="h-4 w-4"
          fill={bookmarked ? 'currentColor' : 'none'}
        />
        {/* 件数を数字だけにしない。読み上げで「12」とだけ言われても何の数か伝わらない */}
        <span>{bookmarked ? '保存済み' : '保存'}</span>
        <span>{count}件</span>
      </button>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  )
}
