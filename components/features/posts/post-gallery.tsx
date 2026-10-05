'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'
import type { PostDetailImage } from '@/lib/posts/post-detail'

/**
 * 短文投稿の写真。スクロールスナップに加え、PCでも1クリックで送れるよう矢印ボタンを置く
 * （スマホはタッチスワイプがあるので md 以上だけに出す）。
 * キーボードでもスクロールできるよう focus 可能にするのは維持する
 *   docs/design/wireframes/browsing.md #S_POST_DETAIL
 */
export function PostGallery({ images }: { images: PostDetailImage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  if (images.length === 0) return null

  function goTo(nextIndex: number) {
    const el = scrollRef.current
    const clamped = Math.max(0, Math.min(images.length - 1, nextIndex))
    setIndex(clamped)
    el?.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
  }

  // タッチスワイプ・スクロールバー操作でも矢印の表示/非表示が追従するよう、スクロール位置から現在位置を推定する
  function handleScroll() {
    const el = scrollRef.current
    if (!el || el.clientWidth === 0) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <section aria-label={`写真${images.length}枚`} className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-lg bg-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        tabIndex={images.length > 1 ? 0 : undefined}
      >
        {images.map((image, i) => (
          <figure key={image.url} className="relative aspect-[4/3] w-full shrink-0 snap-center">
            <Image
              src={image.url}
              alt={image.altText}
              fill
              // 1枚目だけ LCP 候補として優先読み込みする
              priority={i === 0}
              sizes="(min-width: 1024px) 640px, 100vw"
              className="object-contain"
            />
            {images.length > 1 && (
              <figcaption className="absolute right-2 bottom-2 rounded-md bg-surface/80 px-2 py-1 text-sm text-muted-foreground">
                {i + 1} / {images.length}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {images.length > 1 && index > 0 && (
        <button
          type="button"
          aria-label="前の写真"
          onClick={() => goTo(index - 1)}
          className="absolute top-1/2 left-2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface/90 text-foreground shadow-elevation-1 transition-colors hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none md:flex"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
      )}

      {images.length > 1 && index < images.length - 1 && (
        <button
          type="button"
          aria-label="次の写真"
          onClick={() => goTo(index + 1)}
          className="absolute top-1/2 right-2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface/90 text-foreground shadow-elevation-1 transition-colors hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none md:flex"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      )}
    </section>
  )
}
