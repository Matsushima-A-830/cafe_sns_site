import Image from 'next/image'
import Link from 'next/link'
import { BookmarkButton } from '@/components/features/posts/bookmark-button'
import { LikeButton } from '@/components/features/posts/like-button'
import { OfficialBadge, OfficialSummary } from '@/components/features/posts/official-badge'
import { PostAuthor } from '@/components/features/posts/post-author'
import type { PostListItem } from '@/lib/posts/post-list'
import { isStoragePublicUrl } from '@/lib/storage/public-url'

/**
 * フィードの投稿カード（S_HOME / S_EXPLORE）。
 *
 * アクション行はいいね・保存を置く。コメントは投稿詳細でしか書けない（返信UIをカードに
 * 持ち込むと一覧が重くなる）ので件数リンクも出さない（投稿詳細と異なる判断）。
 * 本文は PostBody ではなく抜粋にする — 見出しやリスト、埋め込み画像が
 * そのまま出るとカードの高さが揃わない
 *   docs/design/wireframes/browsing.md #S_HOME
 */
export function PostCard({
  post,
  isAuthenticated,
}: {
  post: PostListItem
  isAuthenticated: boolean
}) {
  const href = `/posts/${post.id}`
  // 本文JSONもプロフィールも API 直叩きで書き換えられる。自前 Storage の URL だけ描画する
  const imageUrl = post.image && isStoragePublicUrl(post.image.url) ? post.image.url : null

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-default bg-surface shadow-elevation-1">
      {imageUrl && (
        <Link
          href={href}
          // 本文リンクと行き先が同じなので、キーボードとスクリーンリーダーには重複させない
          aria-hidden="true"
          tabIndex={-1}
          className="relative block aspect-square w-full bg-muted"
        >
          <Image
            src={imageUrl}
            alt={post.image?.altText ?? ''}
            fill
            sizes="(min-width: 1280px) 400px, (min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </Link>
      )}

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <PostAuthor author={post.author} publishedAt={post.publishedAt} />
          {post.isOfficial && <OfficialBadge />}
        </div>

        <Link
          href={href}
          className="flex flex-col gap-1 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          {post.title && (
            <h3 className="text-base font-bold text-foreground line-clamp-2">{post.title}</h3>
          )}
          {post.metadata && <OfficialSummary metadata={post.metadata} />}
          {post.excerpt ? (
            <p className="text-sm text-muted-foreground line-clamp-3">{post.excerpt}</p>
          ) : (
            // 写真だけの投稿はタイトルも本文も無い。リンクを無名にしない
            !post.title && <span className="sr-only">{post.author.displayName}さんの投稿</span>
          )}
        </Link>

        {post.cafe && (
          <Link
            href={`/cafes/${post.cafe.id}`}
            className="text-sm font-bold text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            {post.cafe.name}
            {post.cafe.areaLabel && (
              <span className="ml-2 font-normal text-muted-foreground">{post.cafe.areaLabel}</span>
            )}
          </Link>
        )}

        {post.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <li key={tag.id}>
                <Link
                  href={`/explore?tag=${encodeURIComponent(tag.slug)}`}
                  className="inline-block rounded-md border border-border-default bg-muted px-2 py-1 text-xs text-muted-foreground hover:border-secondary hover:text-secondary focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                >
                  #{tag.label}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border-default pt-3">
          <LikeButton
            postId={post.id}
            initialLiked={post.likedByViewer}
            initialCount={post.likeCount}
            isAuthenticated={isAuthenticated}
            returnTo={href}
          />
          <BookmarkButton
            postId={post.id}
            initialBookmarked={post.bookmarkedByViewer}
            initialCount={post.bookmarkCount}
            isAuthenticated={isAuthenticated}
            returnTo={href}
          />
        </div>
      </div>
    </article>
  )
}
