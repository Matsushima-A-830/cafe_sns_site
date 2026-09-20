// S_BOOKMARKS: 保存した投稿一覧
// 詳細: docs/design/wireframes/mypage.md#s_favorites--s_want_to_go--s_bookmarks / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PostCard } from '@/components/features/posts/post-card'
import { BOOKMARK_LIST_LIMIT, getUserBookmarkedPosts } from '@/lib/posts/bookmarks'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: '保存した投稿' }

export default async function BookmarksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // middleware が /me 配下の未ログインを弾くが、matcher の変更で無防備になるのを避ける
  if (!user) redirect('/login?next=%2Fme%2Fbookmarks')

  const posts = await getUserBookmarkedPosts(supabase, user.id, BOOKMARK_LIST_LIMIT)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/me"
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← マイページ
        </Link>
        <h1 className="text-2xl font-bold text-foreground">
          保存した投稿
          <span className="ml-2 text-base font-normal text-muted-foreground">{posts.length}件</span>
        </h1>

        {/* ページ送りが無いので、打ち切ったことを黙らせない（cafe-list-page.tsx と同じ判断） */}
        {posts.length >= BOOKMARK_LIST_LIMIT && (
          <p className="text-sm text-muted-foreground">
            新しい順に{BOOKMARK_LIST_LIMIT}件までを表示しています。
          </p>
        )}
      </header>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
          保存した投稿はまだありません。投稿の「保存」ボタンから追加できます。
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} isAuthenticated />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
