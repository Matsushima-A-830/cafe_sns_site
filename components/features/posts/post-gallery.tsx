import Image from 'next/image'
import type { PostDetailImage } from '@/lib/posts/post-detail'

/**
 * 短文投稿の写真。JSなしの横スクロール＋スクロールスナップで実装する。
 * ワイヤーのドットインジケータは現在位置の追従にJSが要るため、代わりに
 * 「n枚中m枚目」を各スライドに重ねる（S_POST_DETAIL 写真スワイパー）
 *   docs/design/wireframes/browsing.md #S_POST_DETAIL
 */
export function PostGallery({ images }: { images: PostDetailImage[] }) {
  if (images.length === 0) return null

  return (
    <section
      className="flex snap-x snap-mandatory overflow-x-auto rounded-lg bg-muted"
      // 複数枚は横スクロールで見る領域。キーボードでもスクロールできるよう focus 可能にする
      aria-label={`写真${images.length}枚`}
      tabIndex={images.length > 1 ? 0 : undefined}
    >
      {images.map((image, index) => (
        <figure key={image.url} className="relative aspect-[4/3] w-full shrink-0 snap-center">
          <Image
            src={image.url}
            alt={image.altText}
            fill
            // 1枚目だけ LCP 候補として優先読み込みする
            priority={index === 0}
            sizes="(min-width: 1024px) 640px, 100vw"
            className="object-contain"
          />
          {images.length > 1 && (
            <figcaption className="absolute right-2 bottom-2 rounded-md bg-surface/80 px-2 py-1 text-sm text-muted-foreground">
              {index + 1} / {images.length}
            </figcaption>
          )}
        </figure>
      ))}
    </section>
  )
}
