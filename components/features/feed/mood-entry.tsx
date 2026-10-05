'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { PostListTag } from '@/lib/posts/post-list'

/**
 * 「今、どんなカフェ気分？」— 差別化の要（幹A）。ホーム最上部に置き、
 * シーンから探せることを最初に見せる
 *   docs/product/positioning.md 幹A / docs/design/wireframes/browsing.md #S_HOME
 *
 * PC はマウスでの横スクロールバー操作がしづらいため、矢印ボタンでページ送りできるようにする
 * （スマホはタッチスワイプがあるので md 以上だけに出す）。スクロール自体は残す
 * （トラックパッド・Shift+ホイールでの操作を塞がないため）
 */
export function MoodEntry({ tags }: { tags: PostListTag[] }) {
  const scrollRef = useRef<HTMLUListElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: マウント時に一度だけ登録する（tags は再マウント時のみ変わる想定）
  useEffect(() => {
    updateScrollState()
    window.addEventListener('resize', updateScrollState)
    return () => window.removeEventListener('resize', updateScrollState)
  }, [])

  function scrollByPage(direction: 1 | -1) {
    scrollRef.current?.scrollBy({
      left: direction * scrollRef.current.clientWidth * 0.8,
      behavior: 'smooth',
    })
  }

  if (tags.length === 0) return null

  return (
    <section aria-labelledby="mood-entry-heading" className="flex flex-col gap-3">
      <h2 id="mood-entry-heading" className="font-heading text-lg font-bold text-foreground">
        今、どんなカフェ気分？
      </h2>

      <div className="relative">
        {canScrollLeft && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-10 bg-gradient-to-r from-background to-transparent md:block"
            />
            <button
              type="button"
              aria-label="前の気分を見る"
              onClick={() => scrollByPage(-1)}
              className="absolute top-1/2 left-0 z-20 hidden size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface text-foreground shadow-elevation-1 transition-colors hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none md:flex"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
          </>
        )}

        {/* 横スクロール領域。中のチップが全部リンクなので Tab でそのまま辿れる */}
        <ul
          ref={scrollRef}
          onScroll={updateScrollState}
          className="flex gap-2 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tags.map((tag) => (
            <li key={tag.id} className="shrink-0">
              <Link
                href={`/explore?tag=${encodeURIComponent(tag.slug)}`}
                className="inline-block rounded-full border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-foreground shadow-elevation-1 transition-colors hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
              >
                {tag.label}
              </Link>
            </li>
          ))}
        </ul>

        {canScrollRight && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-10 bg-gradient-to-l from-background to-transparent md:block"
            />
            <button
              type="button"
              aria-label="次の気分を見る"
              onClick={() => scrollByPage(1)}
              className="absolute top-1/2 right-0 z-20 hidden size-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface text-foreground shadow-elevation-1 transition-colors hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none md:flex"
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          </>
        )}
      </div>

      {/* エリア・雰囲気・利用機会を組み合わせた検索への入り口。S_SEARCH 実装前は遷移先が無く出していなかった（pending-items D27） */}
      <Link
        href="/search"
        className="self-end text-sm text-link underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
      >
        もっと見る ▶
      </Link>
    </section>
  )
}
