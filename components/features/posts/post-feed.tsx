'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { loadMoreFeed } from '@/app/_actions/feed'
import { PostCard } from '@/components/features/posts/post-card'
import { Button } from '@/components/ui/button'
import type { PostListCursor, PostListItem, PostListPage } from '@/lib/posts/post-list'
import { errorMessage } from '@/lib/utils/error-messages'
import type { FeedQuery } from '@/lib/validators/feed'

type StoredFeedState = {
  items: PostListItem[]
  cursor: PostListCursor | null
  scrollY: number
}

/**
 * フィード本体。初回ぶんはサーバーで描画済みのものを受け取り、スクロールで
 * IntersectionObserver が keyset カーソルの続きを自動追記する。対象5画面は
 * すべて SSR（Router Cache に乗らない）ため、投稿詳細から戻ると React state は
 * 失われる。読み込み済み一覧とスクロール位置は sessionStorage に退避して復元する（pending-items D26）
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
  const pathname = usePathname()
  // 画面＋クエリ単位で分離する。親が key={...} で remount させるタブ切替（S_HOME/S_EXPLORE）も
  // 含めて、保存先がタブごとに食い違わないよう実際のクエリ内容から直接作る
  const storageKey = `post-feed:${pathname}:${JSON.stringify(query)}`

  const [items, setItems] = useState<PostListItem[]>(initialPage.items)
  const [cursor, setCursor] = useState<PostListCursor | null>(initialPage.nextCursor)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const itemsRef = useRef(items)
  const cursorRef = useRef(cursor)
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    itemsRef.current = items
    cursorRef.current = cursor
  }, [items, cursor])

  // biome-ignore lint/correctness/useExhaustiveDependencies: マウント時に一度だけ復元する
  useEffect(() => {
    // Safari のプライベートブラウジング等では sessionStorage へのアクセス自体が
    // 例外を投げうる。読み取り・パースの両方を try で包み、失敗時はサーバー描画のまま進める
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (!saved) return
      const restored = JSON.parse(saved) as StoredFeedState
      setItems(restored.items)
      setCursor(restored.cursor)
      window.scrollTo({ top: restored.scrollY, behavior: 'auto' })
    } catch {
      // 読めなければ initialPage のまま
    }
  }, [])

  // 読み込み済み一覧とカーソルは変化のたびに保存する
  useEffect(() => {
    try {
      const payload: StoredFeedState = { items, cursor, scrollY: window.scrollY }
      sessionStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {
      // 容量超過等は諦める（次の訪問はサーバー描画からやり直すだけ）
    }
  }, [storageKey, items, cursor])

  // スクロール位置も継続的に保存する（読み込みを挟まずスクロールだけした場合に備える）
  useEffect(() => {
    let ticking = false
    function persistScroll() {
      try {
        const payload: StoredFeedState = {
          items: itemsRef.current,
          cursor: cursorRef.current,
          scrollY: window.scrollY,
        }
        sessionStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        // 容量超過等は諦める
      }
    }
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        persistScroll()
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      persistScroll()
    }
  }, [storageKey])

  function handleLoadMore() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）。loadingRef は
    // IntersectionObserver からの連続発火を isPending の state 反映を待たずに止めるため
    if (loadingRef.current || !cursor) return
    loadingRef.current = true
    setError(null)
    startTransition(async () => {
      const result = await loadMoreFeed({ query, cursor })
      loadingRef.current = false
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setItems((current) => [...current, ...result.data.items])
      setCursor(result.data.nextCursor)
    })
  }

  // 末尾の番兵が画面に近づいたら自動で次ページを読み込む
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleLoadMore は cursor 変化のたびに作り直せば十分
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !cursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore()
      },
      { rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [cursor])

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

      {/* 読み込み結果の追記はスクリーンリーダーにも伝える。無限スクロールで連続更新
          されないよう、isPending の切り替わり（読み込み完了のタイミング）でのみ変わる */}
      <p aria-live="polite" className="sr-only">
        {isPending ? '読み込み中' : `${items.length}件を表示中`}
      </p>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {cursor && (
        <div ref={sentinelRef} className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            aria-busy={isPending}
            // 通常はスクロールで自動読み込みするため視覚的には隠す。キーボード操作で
            // フォーカスしたときだけ見える代替トリガーとして残す（WCAG 2.1 AA: 操作可能性）
            className="sr-only focus-visible:not-sr-only"
          >
            {isPending ? '読み込み中…' : 'もっと見る'}
          </Button>
        </div>
      )}
    </div>
  )
}
