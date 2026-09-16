import Link from 'next/link'
import type { PostListTag } from '@/lib/posts/post-list'

/**
 * 「今、どんなカフェ気分？」— 差別化の要（幹A）。ホーム最上部に置き、
 * シーンから探せることを最初に見せる
 *   docs/product/positioning.md 幹A / docs/design/wireframes/browsing.md #S_HOME
 */
export function MoodEntry({ tags }: { tags: PostListTag[] }) {
  if (tags.length === 0) return null

  return (
    <section aria-labelledby="mood-entry-heading" className="flex flex-col gap-3">
      <h2 id="mood-entry-heading" className="text-lg font-bold text-foreground">
        今、どんなカフェ気分？
      </h2>
      {/* 横スクロール領域。中のチップが全部リンクなので Tab でそのまま辿れる */}
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {tags.map((tag) => (
          <li key={tag.id} className="shrink-0">
            <Link
              href={`/explore?tag=${encodeURIComponent(tag.slug)}`}
              className="inline-block rounded-lg border border-border-strong bg-surface px-4 py-3 text-base text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              {tag.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
