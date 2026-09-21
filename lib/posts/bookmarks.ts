import type { SupabaseClient } from '@supabase/supabase-js'
import { getPostImagePublicUrl } from '@/lib/storage/post-images'
import type { Database } from '@/types/database'
import { type PostListItem, type PostListTag, toPostListItem } from './post-list'

/**
 * S_BOOKMARKS（保存した投稿一覧）の読み取り。post_bookmarks_select_own が
 * user_id = auth.uid() だけで RLS を閉じているので、user_id は絞らずそちらに任せる
 * （getUserCafeList と同じ方針）。
 *   docs/architecture/data-model/tables.md #post_bookmarks
 *   docs/design/wireframes/mypage.md #S_FAVORITES--S_WANT_TO_GO--S_BOOKMARKS
 */

type Client = SupabaseClient<Database>

/** 一覧はページ送り未実装（pending-items D32 と同じ判断）。全件返して固まらないための上限 */
export const BOOKMARK_LIST_LIMIT = 100
/** マイページ中段のタブ切替プレビュー（他レーンと同じ「最新5件」） */
export const BOOKMARK_PREVIEW_LIMIT = 5

/**
 * `posts!inner` が必須。
 *
 * post_bookmarks_select_own は自分の行を必ず読ませるが、投稿の可視性
 * （status='published' かつ deleted_at is null）はここで明示フィルタする。
 * posts_select_own（作者本人には hidden な予約行も見せる OR 句）が合成されるため、
 * フィルタを付けないと保存した自分の予約投稿が一覧に混ざる
 *   supabase/migrations/20260910120000_fix_posts_select_own.sql
 *
 * `!inner` を付けるのは、フィルタに落ちた投稿を cafes!inner と同じ理由で行ごと落とすため。
 * 付けないと「保存行はあるのに posts が null」の空カードが並び、件数（bookmarkCount）と
 * 一覧の表示件数がずれる
 *   lib/cafes/user-cafe-lists.ts LIST_SELECT
 */
const BOOKMARK_SELECT = `
  post_id, created_at,
  post:posts!inner (
    id, post_type, title, body_text, published_at, created_at, like_count, bookmark_count,
    is_official, official_format, metadata,
    author:profiles!posts_author_id_fkey (id, username, display_name, avatar_url),
    cafe:cafes!posts_cafe_id_fkey (id, name, area_code, areas!cafes_area_code_fkey (label)),
    post_images (storage_path, alt_text),
    post_tags (tags (id, slug, label)),
    my_like:likes (user_id)
  )
` as const

type BookmarkRow = {
  post_id: string
  created_at: string
  post: {
    id: string
    post_type: string
    title: string | null
    body_text: string | null
    published_at: string | null
    created_at: string
    like_count: number
    bookmark_count: number
    is_official: boolean
    official_format: string | null
    metadata: unknown
    author: {
      id: string
      username: string
      display_name: string
      avatar_url: string | null
    } | null
    cafe: {
      id: string
      name: string
      area_code: string | null
      areas: { label: string } | null
    } | null
    post_images: { storage_path: string; alt_text: string | null }[]
    post_tags: { tags: PostListTag | null }[]
    my_like: { user_id: string }[]
  }
}

function toBookmarkedPostItem(
  row: BookmarkRow,
  viewerId: string,
  toPublicUrl: (path: string) => string,
): PostListItem {
  return toPostListItem({ ...row.post, my_bookmark: [{ user_id: viewerId }] }, toPublicUrl)
}

/**
 * 保存した投稿を保存日時の新しい順で取る。取得自体に失敗したら例外（空配列に丸めない）。
 *
 * `post.my_like.user_id` へのフィルタは getPostList と同じ理由（埋め込みへのフィルタは
 * 「返す子行」にしか効かず、投稿そのものは消えない）。付けないと likes_select_all が
 * 公開ポリシーのため他人のいいね行まで無条件に返ってしまう
 */
export async function getUserBookmarkedPosts(
  supabase: Client,
  viewerId: string,
  limit = BOOKMARK_LIST_LIMIT,
): Promise<PostListItem[]> {
  const { data, error } = await supabase
    .from('post_bookmarks')
    .select(BOOKMARK_SELECT)
    .eq('post.status', 'published')
    .is('post.deleted_at', null)
    .eq('post.my_like.user_id', viewerId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`保存した投稿の取得に失敗しました: ${error.message}`)

  const rows = (data ?? []) as unknown as BookmarkRow[]
  return rows.map((row) =>
    toBookmarkedPostItem(row, viewerId, (path) => getPostImagePublicUrl(supabase, path)),
  )
}

/**
 * 4カードの件数バッジ。一覧（getUserBookmarkedPosts）と必ず同じ条件で数える
 * （getUserCafeListCounts と同じ理由。`posts!inner` を省くと件数だけ残ってずれる）
 */
export async function getUserBookmarkCount(supabase: Client): Promise<number> {
  const { count, error } = await supabase
    .from('post_bookmarks')
    .select('post_id, posts!inner (id)', { count: 'exact', head: true })
    .eq('posts.status', 'published')
    .is('posts.deleted_at', null)

  if (error) throw new Error(`保存件数の取得に失敗しました: ${error.message}`)
  return count ?? 0
}
