'use client'

import { useState, useTransition } from 'react'
import { loadMoreFeed } from '@/app/_actions/feed'
import { PostCard } from '@/components/features/posts/post-card'
import { Button } from '@/components/ui/button'
import type { PostListCursor, PostListItem, PostListPage } from '@/lib/posts/post-list'
import { errorMessage } from '@/lib/utils/error-messages'
import type { FeedQuery } from '@/lib/validators/feed'

/**
 * フィード本体。初回ぶんはサーバーで描画済みのものを受け取り、「もっと見る」で
 * keyset カーソルの続きを追記する。無限スクロールにしないのは、投稿詳細から
 * 戻ったときのスクロール位置と読み込み済みページの復元が要るため（pending-items D26）
 */
export function PostFeed({
  initialPage,
  query,
  isAuthenticated,
  emptyMessage = 'まだ投稿がありません。',
}: {
  initialPage: PostListPage
  query: FeedQuery
  /** カードのいいねボタンの出し分けに使う。ここでは取れないのでページから渡す */
  isAuthenticated: boolean
  emptyMessage?: string
}) {
  const [items, setItems] = useState<PostListItem[]>(initialPage.items)
  const [cursor, setCursor] = useState<PostListCursor | null>(initialPage.nextCursor)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleLoadMore() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）
    if (isPending || !cursor) return
    setError(null)
    startTransition(async () => {
      const result = await loadMoreFeed({ query, cursor })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setItems((current) => [...current, ...result.data.items])
      setCursor(result.data.nextCursor)
    })
  }

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {items.map((post) => (
          <li key={post.id}>
            <PostCard post={post} isAuthenticated={isAuthenticated} />
          </li>
        ))}
      </ul>

      {/* 読み込み結果の追記はスクリーンリーダーにも伝える */}
      <p aria-live="polite" className="sr-only">
        {isPending ? '読み込み中' : `${items.length}件を表示中`}
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            // 送信中に disabled にしない。無効化された瞬間にフォーカスが body へ落ちる。
            // 連打は handleLoadMore 側の isPending ガードで止める
            aria-busy={isPending}
          >
            {isPending ? '読み込み中…' : 'もっと見る'}
          </Button>
        </div>
      )}
    </div>
  )
}
