import Link from 'next/link'
import type { PostListTag } from '@/lib/posts/post-list'

/**
 * S_HOME（PC）の3カラム右側。ワイヤーの「おすすめユーザー」は follows への書き込み導線が
 * 未実装なので出さない（pending-items D27）
 *   docs/design/wireframes/browsing.md #S_HOME PC
 */
export function SuggestedTags({ tags }: { tags: PostListTag[] }) {
  if (tags.length === 0) return null

  return (
    <aside aria-labelledby="suggested-tags-heading" className="hidden w-64 shrink-0 lg:block">
      <h2 id="suggested-tags-heading" className="mb-3 text-base font-bold text-foreground">
        おすすめタグ
      </h2>
      <ul className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li key={tag.id}>
            <Link
              href={`/explore?tag=${encodeURIComponent(tag.slug)}`}
              className="inline-block rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              #{tag.label}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
