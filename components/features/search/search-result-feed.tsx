'use client'

import { useState, useTransition } from 'react'
import { loadMoreSearch } from '@/app/_actions/search'
import { PostCard } from '@/components/features/posts/post-card'
import { Button } from '@/components/ui/button'
import type { PostListCursor, PostListItem, PostListPage } from '@/lib/posts/post-list'
import { errorMessage } from '@/lib/utils/error-messages'
import type { SearchQuery } from '@/lib/validators/search'

/**
 * S_SEARCH の結果一覧。初回ぶんはサーバーで描画済みのものを受け取り、「もっと見る」で
 * keyset カーソルの続きを追記する（components/features/posts/post-feed.tsx と同型）
 */
export function SearchResultFeed({
  initialPage,
  query,
  isAuthenticated,
}: {
  initialPage: PostListPage
  query: SearchQuery
  isAuthenticated: boolean
}) {
  const [items, setItems] = useState<PostListItem[]>(initialPage.items)
  const [cursor, setCursor] = useState<PostListCursor | null>(initialPage.nextCursor)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleLoadMore() {
    if (!cursor) return
    setError(null)
    startTransition(async () => {
      const result = await loadMoreSearch({ query, cursor })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setItems((current) => [...current, ...result.data.items])
      setCursor(result.data.nextCursor)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((post) => (
          <li key={post.id}>
            <PostCard post={post} isAuthenticated={isAuthenticated} />
          </li>
        ))}
      </ul>

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
          <Button type="button" variant="outline" onClick={handleLoadMore} disabled={isPending}>
            {isPending ? '読み込み中…' : 'もっと見る'}
          </Button>
        </div>
      )}
    </div>
  )
}
