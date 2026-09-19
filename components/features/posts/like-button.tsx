'use client'

import { Heart } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { likePost, unlikePost } from '@/app/_actions/likes'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * 投稿のいいねボタン。カード（S_HOME / S_EXPLORE ほか）と投稿詳細で共有する。
 * コメント・保存は未実装なので、アクション行にはこれ1つだけ置く（枠やプレースホルダは出さない）
 *   docs/design/wireframes/browsing.md #S_HOME #S_POST_DETAIL
 */
export function LikeButton({
  postId,
  initialLiked,
  initialCount,
  isAuthenticated,
  returnTo,
  showLoginHint = false,
}: {
  postId: string
  initialLiked: boolean
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
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending) return

    const previousLiked = liked
    const previousCount = count
    setLiked(!previousLiked)
    setCount(previousCount + (previousLiked ? -1 : 1))
    setError(null)

    startTransition(async () => {
      const result = previousLiked ? await unlikePost({ postId }) : await likePost({ postId })

      if (!result.ok) {
        setLiked(previousLiked)
        setCount(previousCount)
        setError(errorMessage(result.error))
        return
      }
      // 楽観更新の ±1 を確定値で上書きする。押した時点の表示が古いと（別タブで
      // 操作した・他人がいいねした）ズレが残り、この state は props から
      // 1度しか初期化されないため router.refresh() でも直らない
      setCount(result.data.likeCount)
      setStatus(previousLiked ? 'いいねを外しました' : 'いいねしました')
      router.refresh()
    })
  }

  if (!isAuthenticated) {
    if (!showLoginHint) {
      return <p className="text-sm text-muted-foreground">いいね {initialCount}件</p>
    }
    // 既存画面（CafeListButtons）に合わせてモーダルではなくログインリンクにする。
    // ワイヤー（browsing.md:291）はモーダルだが、全画面で導線を揃えるほうを採る
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?next=${encodeURIComponent(returnTo)}`}
          className="text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus"
        >
          ログイン
        </Link>
        するといいねできます（いいね {initialCount}件）
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        // 色だけで状態を伝えない。押下状態とラベルの両方で示す
        aria-pressed={liked}
        // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ち、
        // キーボードで押したユーザーは毎回ページ先頭から辿り直すことになる。
        // 連打は handleClick 側の isPending ガードで止める
        aria-busy={isPending}
        onClick={handleClick}
        className={`inline-flex w-fit items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none ${
          liked ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Heart aria-hidden="true" className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} />
        {/* 件数を数字だけにしない。読み上げで「12」とだけ言われても何の数か伝わらない */}
        <span>{liked ? 'いいね済み' : 'いいね'}</span>
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
