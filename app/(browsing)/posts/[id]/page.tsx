// S_POST_DETAIL: 投稿詳細
// 詳細: docs/design/wireframes/browsing.md#s_post_detail投稿詳細 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { BookmarkButton } from '@/components/features/posts/bookmark-button'
import { CommentList } from '@/components/features/posts/comment-list'
import { LikeButton } from '@/components/features/posts/like-button'
import { PostAuthor } from '@/components/features/posts/post-author'
import { PostBody } from '@/components/features/posts/post-body'
import { PostGallery } from '@/components/features/posts/post-gallery'
import {
  type CommentListPage,
  getCommentAuthorIdentity,
  getPostComments,
} from '@/lib/posts/comments'
import {
  getPostDetail,
  type PostDetail,
  postDescription,
  postDisplayTitle,
} from '@/lib/posts/post-detail'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils/cn'
import { postIdSchema } from '@/lib/validators/posts'

// routing.md は ISR (300s) を想定しているが、ブロック関係の判定に閲覧者のセッションが
// 要るため現状は SSR。ISR に戻す条件は pending-items D23 に整理した

type PageProps = { params: Promise<{ id: string }> }

/** 写真だけの投稿はタイトルも本文も無いので、作者名で見分けられるようにする */
function displayTitle(post: PostDetail): string {
  return postDisplayTitle(post.title, post.bodyJson, `${post.author.displayName}さんの投稿`)
}

/** generateMetadata と本体で2回引かないよう、loadPost と同じく cache() でまとめる */
const loadViewerId = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
})

/**
 * 閲覧者のセッションで読む。anon（cookie を読まない）クライアントで先に読む案もあったが、
 * `posts_select` の最後の条件 `not is_blocked_either_way(author_id)` は anon では常に真に
 * なるため、ブロックした相手の公開投稿がブロック中のユーザーにも見えてしまう。
 * キャッシュ可能性より認可を優先し、cookie 付きの1本に統一する
 *   supabase/migrations/20260907120000_create_posts.sql posts_select
 *   docs/product/pending-items.md D23（ISR を復活させる場合はここの設計から見直す）
 *
 * generateMetadata と本体からの2回の呼び出しは React の cache() で1回にまとめる
 */
const loadPost = cache(async (id: string): Promise<PostDetail | null> => {
  // 不正な形式のIDは PostgREST のエラー（22P02）になるため、DBに問い合わせる前に弾く
  if (!postIdSchema.safeParse({ postId: id }).success) return null

  const supabase = await createClient()
  // いいね済みかを同じクエリで取る。1リクエスト中は閲覧者が変わらないので cache(id) のままでよい
  return getPostDetail(supabase, id, await loadViewerId())
})

/** コメント一覧の初回ぶん。「もっと見る」以降は loadMoreComments（Server Action）が担う */
const loadComments = cache(async (postId: string): Promise<CommentListPage> => {
  const supabase = await createClient()
  return getPostComments(supabase, postId)
})

/** コメントフォームが送信直後にその場で表示するための、閲覧者自身の表示情報 */
const loadViewerIdentity = cache(async () => {
  const viewerId = await loadViewerId()
  if (!viewerId) return null
  const supabase = await createClient()
  return getCommentAuthorIdentity(supabase, viewerId)
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const post = await loadPost(id)
  if (!post) return { title: '投稿が見つかりません' }

  const title = displayTitle(post)
  const description = postDescription(post.bodyJson)
  const image = post.images[0]?.url

  return {
    title,
    // 写真だけの投稿は本文が無い。空文字の description タグを出さない
    description: description.length > 0 ? description : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      publishedTime: post.publishedAt,
      images: image ? [image] : undefined,
    },
    // フォロワー限定投稿は検索結果に出さない（RLS で anon からは読めないが、
    // ログイン中のクローラや将来の共有導線に備えて明示する）
    robots: post.visibility === 'public' ? undefined : { index: false, follow: false },
  }
}

/** カフェ・タグ・本文・いいね。短文とブログでレイアウトは変えるが、この中身は共通 */
function PostContent({ post, isAuthenticated }: { post: PostDetail; isAuthenticated: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {post.cafe && (
        <div className="text-base text-foreground">
          <Link
            href={`/cafes/${post.cafe.id}`}
            className="font-bold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            {post.cafe.name}
          </Link>
          {post.cafe.areaLabel && (
            <span className="ml-2 text-sm text-muted-foreground">{post.cafe.areaLabel}</span>
          )}
        </div>
      )}

      {post.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
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
      )}

      <PostBody doc={post.bodyJson} />

      <div className="flex flex-wrap items-center gap-4">
        <LikeButton
          postId={post.id}
          initialLiked={post.likedByViewer}
          initialCount={post.likeCount}
          isAuthenticated={isAuthenticated}
          returnTo={`/posts/${post.id}`}
          showLoginHint
        />
        <a
          href="#comments"
          className="text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          コメント {post.commentCount}件
        </a>
        <BookmarkButton
          postId={post.id}
          initialBookmarked={post.bookmarkedByViewer}
          initialCount={post.bookmarkCount}
          isAuthenticated={isAuthenticated}
          returnTo={`/posts/${post.id}`}
          showLoginHint
        />
        {/* 統合「⋯」メニュー（ブロック・非表示含む）は別スコープ。block-button.tsx と
            同じ判断で単独リンクだけ出す */}
        <Link
          href={
            isAuthenticated
              ? `/report/post/${post.id}`
              : `/login?next=${encodeURIComponent(`/report/post/${post.id}`)}`
          }
          className="text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          通報する
        </Link>
      </div>
    </div>
  )
}

export default async function PostDetailPage({ params }: PageProps) {
  const { id } = await params
  const post = await loadPost(id)
  if (!post) notFound()
  const viewerId = await loadViewerId()
  const isAuthenticated = viewerId !== null
  const comments = await loadComments(post.id)
  const viewerIdentity = await loadViewerIdentity()
  // 投稿主本人はスパムコメントを論理削除できる（comments_update_moderation）
  const canModerateComments = viewerId !== null && viewerId === post.author.id
  const returnTo = `/posts/${post.id}`

  if (post.postType === 'blog') {
    return (
      <article className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-8">
        <h1 className="text-3xl font-bold text-foreground">{displayTitle(post)}</h1>
        <PostAuthor author={post.author} publishedAt={post.publishedAt} />
        <PostGallery images={post.images} />
        <PostContent post={post} isAuthenticated={isAuthenticated} />
        <CommentList
          postId={post.id}
          initialItems={comments.items}
          initialCursor={comments.nextCursor}
          initialCount={post.commentCount}
          isAuthenticated={isAuthenticated}
          canModerate={canModerateComments}
          viewer={viewerIdentity}
          returnTo={returnTo}
        />
      </article>
    )
  }

  // 写真なしの短文で2ペインを組むと、PCで左半分が空いたまま文章だけが痩せて並ぶ。
  // 写真がある場合だけ「写真 + 情報」の2ペインにする（S_POST_DETAIL のPCレイアウト）
  const hasImages = post.images.length > 0

  return (
    <article
      className={cn(
        'mx-auto flex w-full flex-col gap-6 px-4 py-8',
        hasImages ? 'max-w-6xl' : 'max-w-[720px]',
      )}
    >
      <div className={cn('flex w-full flex-col gap-6', hasImages && 'lg:flex-row lg:items-start')}>
        {hasImages && (
          <div className="w-full lg:flex-1">
            <PostGallery images={post.images} />
          </div>
        )}
        <div className={cn('flex w-full flex-col gap-4', hasImages && 'lg:w-96 lg:shrink-0')}>
          {/* 短文投稿にタイトルは無い。見出しの階層を崩さないよう h1 は作者行が兼ねる */}
          <h1 className="sr-only">{displayTitle(post)}</h1>
          <PostAuthor author={post.author} publishedAt={post.publishedAt} />
          <PostContent post={post} isAuthenticated={isAuthenticated} />
        </div>
      </div>

      <CommentList
        postId={post.id}
        initialItems={comments.items}
        initialCursor={comments.nextCursor}
        initialCount={post.commentCount}
        isAuthenticated={isAuthenticated}
        canModerate={canModerateComments}
        viewer={viewerIdentity}
        returnTo={returnTo}
      />
    </article>
  )
}
