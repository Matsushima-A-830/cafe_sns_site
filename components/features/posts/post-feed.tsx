'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { loadMoreFeed } from '@/app/_actions/feed'
import { PostCard } from '@/components/features/posts/post-card'
import { Button } from '@/components/ui/button'
import type { PostListCursor, PostListItem, PostListPage } from '@/lib/posts/post-list'
import { errorMessage } from '@/lib/utils/error-messages'
import {
  type FeedQuery,
  type FeedRestoreState,
  feedRestoreStateSchema,
} from '@/lib/validators/feed'

/**
 * フィード本体。スクロールで IntersectionObserver が keyset カーソルの続きを自動追記する。
 * 何ページぶん読み込んだか（pageCount）とスクロール位置は sessionStorage に退避し、マウント時に
 * pageCount 分だけ loadMoreFeed を叩き直して復元する（pending-items D26）。投稿データそのものは
 * キャッシュしない — ブロック・削除・フォロー解除等で可視性が変わった投稿が、リロードや
 * 戻る操作のたびに古いまま表示され続けることを避けるため、常に最新の RLS 結果で組み立て直す
 */
export function PostFeed({
  initialPage,
  query,
  isAuthenticated,
  emptyMessage = 'まだ投稿がありません。',
  cacheKey,
}: {
  initialPage: PostListPage
  query: FeedQuery
  /** カードのいいねボタンの出し分けに使う。ここでは取れないのでページから渡す */
  isAuthenticated: boolean
  emptyMessage?: string
  /**
   * sessionStorage のキーに足す識別子。query に出てこない値で親が key={...} remount
   * させている場合（例: users/[username] のフォロー状態）に必須。無いと remount 後も
   * 古い保存内容が復元され、RLSで変わったはずの投稿一覧が上書きされてしまう
   */
  cacheKey?: string
}) {
  const pathname = usePathname()
  // 画面＋クエリ＋cacheKey単位で分離する。親が key={...} で remount させるケース
  // （タブ切替、フォロー状態変化）すべてで保存先が食い違わないようにする
  const storageKey = `post-feed:${pathname}:${cacheKey ?? ''}:${JSON.stringify(query)}`

  const [items, setItems] = useState<PostListItem[]>(initialPage.items)
  const [cursor, setCursor] = useState<PostListCursor | null>(initialPage.nextCursor)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // 読み込んだページ数（items.length とは別管理。復元時に同じ回数だけ loadMoreFeed を
  // 叩き直すための単位で、投稿の中身は持たない）
  const pageCountRef = useRef(0)
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // 復元中（loadMoreFeed を叩き直している最中）は scroll effect 側の persist を止める。
  // StrictMode の開発時二重実行で先に unmount クリーンアップが走ると、復元が終わる前に
  // pageCountRef.current（まだ0）で sessionStorage を上書きし、保存内容を消してしまうため
  const restoringRef = useRef(false)

  const persist = useCallback(
    (scrollY: number) => {
      try {
        const payload: FeedRestoreState = { pageCount: pageCountRef.current, scrollY }
        sessionStorage.setItem(storageKey, JSON.stringify(payload))
      } catch {
        // Safari のプライベートブラウジング・容量超過等は諦める
      }
    },
    [storageKey],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: マウント時に一度だけ復元する
  useEffect(() => {
    // 保存が無い・壊れている・pageCount=0 の大半のケースはここで同期的に抜ける。
    // startTransition に包むのはページ数ぶん loadMoreFeed を叩き直す本当の復元処理だけにする
    // （ここも包むと、復元不要な初回マウントまで一瞬 isPending=true になりボタン文言が揺れる）
    let restored: FeedRestoreState
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (!saved) return
      const parsed = feedRestoreStateSchema.safeParse(JSON.parse(saved))
      if (!parsed.success || parsed.data.pageCount === 0) {
        if (parsed.success) window.scrollTo({ top: parsed.data.scrollY, behavior: 'auto' })
        return
      }
      restored = parsed.data
    } catch {
      // 読めなければ initialPage のまま
      return
    }

    let cancelled = false
    loadingRef.current = true
    restoringRef.current = true
    startTransition(async () => {
      // 投稿データはキャッシュせず、保存されていたページ数ぶんだけ loadMoreFeed を叩き直す。
      // ブロック・削除・フォロー解除等で可視性が変わっていても、常に今の RLS 結果になる
      let nextCursor = initialPage.nextCursor
      for (let i = 0; i < restored.pageCount && nextCursor && !cancelled; i++) {
        const result = await loadMoreFeed({ query, cursor: nextCursor })
        if (!result.ok || cancelled) break
        setItems((current) => [...current, ...result.data.items])
        nextCursor = result.data.nextCursor
        setCursor(nextCursor)
        pageCountRef.current += 1
      }
      loadingRef.current = false
      if (!cancelled) {
        restoringRef.current = false
        persist(restored.scrollY)
        window.scrollTo({ top: restored.scrollY, behavior: 'auto' })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // スクロール位置は継続的に保存する（読み込みを挟まずスクロールだけした場合に備える）
  useEffect(() => {
    let ticking = false
    function onScroll() {
      if (ticking || restoringRef.current) return
      ticking = true
      requestAnimationFrame(() => {
        persist(window.scrollY)
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      // 復元中（pageCountRef がまだ反映しきっていない）はここで上書きしない
      if (!restoringRef.current) persist(window.scrollY)
    }
  }, [persist])

  function handleLoadMore() {
    // disabled にせず自前で弾く（下の aria-busy のコメント参照）。loadingRef は
    // IntersectionObserver からの連続発火や復元中の二重読み込みを isPending の
    // state 反映を待たずに止めるため
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
      pageCountRef.current += 1
      persist(window.scrollY)
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
