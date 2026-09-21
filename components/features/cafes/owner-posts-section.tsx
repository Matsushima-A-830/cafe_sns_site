import Link from 'next/link'
import { OfficialBadge, OfficialSummary } from '@/components/features/posts/official-badge'
import { OFFICIAL_FORMAT_LABELS } from '@/lib/constants/posts'
import type { PostListItem } from '@/lib/posts/post-list'
import { formatPostDate } from '@/lib/utils/format-date'

/**
 * S_CAFE_DETAIL の「オーナーから」セクション（幹C-2）。一般投稿の投稿グリッドとは別に、
 * 公式投稿だけを集約表示する。件数が多いカフェの「もっと見る」ページングは、
 * S_CAFE_DETAIL に専用ルートが無いため今回は持たない（直近3件のみ表示）
 *   docs/design/wireframes/browsing.md #S_CAFE_DETAIL
 */
export function OwnerPostsSection({ posts }: { posts: PostListItem[] }) {
  if (posts.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">オーナーから</h2>
      <ul className="flex flex-col gap-3">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/posts/${post.id}`}
              className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              <div className="flex flex-wrap items-center gap-2">
                <OfficialBadge />
                {post.officialFormat && (
                  <span className="text-sm font-bold text-foreground">
                    {OFFICIAL_FORMAT_LABELS[post.officialFormat]}
                  </span>
                )}
              </div>

              {post.metadata && <OfficialSummary metadata={post.metadata} />}

              {post.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
              )}

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                <span>
                  <span aria-hidden="true">❤</span> いいね{post.likeCount}件
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
