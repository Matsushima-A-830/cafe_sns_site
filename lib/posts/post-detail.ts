import type { SupabaseClient } from '@supabase/supabase-js'
import { isOfficialFormat, type OfficialFormat } from '@/lib/constants/posts'
import { type OfficialMetadata, toOfficialMetadata } from '@/lib/posts/official-metadata'
import { getPostImagePublicUrl } from '@/lib/storage/post-images'
import { extractPlainText } from '@/lib/validators/posts'
import type { Database } from '@/types/database'

/**
 * 投稿詳細（S_POST_DETAIL）の読み取り。Server Actions（書き込み用途）ではなくここに
 * 置くのは、ページの Server Component から呼ぶ純粋な読み取りだから
 *   docs/architecture/routing.md #URLとスクリーンIDの対応表
 */

const TITLE_FALLBACK_LENGTH = 30
const DESCRIPTION_LENGTH = 120

type Client = SupabaseClient<Database>

export type PostDetailImage = { url: string; altText: string }
export type PostDetailTag = { id: string; slug: string; label: string }

export type PostDetail = {
  id: string
  postType: 'short' | 'blog'
  title: string | null
  bodyJson: unknown
  visibility: string
  publishedAt: string
  author: { id: string; username: string; displayName: string; avatarUrl: string | null }
  cafe: { id: string; name: string; areaLabel: string | null } | null
  images: PostDetailImage[]
  tags: PostDetailTag[]
  likeCount: number
  /** 閲覧者自身がいいね済みか。未ログインでは常に false */
  likedByViewer: boolean
  commentCount: number
  bookmarkCount: number
  /** 閲覧者自身が保存済みか。未ログインでは常に false */
  bookmarkedByViewer: boolean
  /** 経営者による公式投稿か（幹C-2）。true のときのみ officialFormat/metadata が意味を持つ */
  isOfficial: boolean
  officialFormat: OfficialFormat | null
  metadata: OfficialMetadata | null
}

/**
 * 1クエリで投稿・作者・カフェ・画像・タグ・いいね状態をまとめて取る（N+1回避）。
 *
 * いいね済みかの埋め込みに `!inner` は付けない。付けると「まだいいねしていない投稿」が
 * 0件になり、詳細ページがまるごと 404 になる
 */
function buildPostDetailSelect(viewerId: string | null): string {
  const parts = [
    'id, post_type, title, body_json, visibility, published_at, created_at, like_count, comment_count, bookmark_count, is_official, official_format, metadata',
    'author:profiles!posts_author_id_fkey (id, username, display_name, avatar_url)',
    'cafe:cafes!posts_cafe_id_fkey (id, name, area_code, areas!cafes_area_code_fkey (label))',
    'post_images (storage_path, alt_text, display_order)',
    'post_tags (tags (id, slug, label))',
  ]
  if (viewerId) {
    parts.push('my_like:likes (user_id)')
    parts.push('my_bookmark:post_bookmarks (user_id)')
  }
  return parts.join(', ')
}

type PostDetailRow = {
  id: string
  post_type: string
  title: string | null
  body_json: unknown
  visibility: string
  published_at: string | null
  created_at: string
  like_count: number
  comment_count: number
  bookmark_count: number
  is_official: boolean
  official_format: string | null
  metadata: unknown
  /** viewerId を渡したときだけ付く。空配列＝まだいいねしていない */
  my_like?: { user_id: string }[]
  /** viewerId を渡したときだけ付く。空配列＝まだ保存していない */
  my_bookmark?: { user_id: string }[]
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
  post_images: { storage_path: string; alt_text: string | null; display_order: number }[]
  post_tags: { tags: { id: string; slug: string; label: string } | null }[]
}

export function postPlainText(bodyJson: unknown): string {
  return extractPlainText(bodyJson).replace(/\s+/g, ' ').trim()
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/**
 * タイトルが無い短文投稿は本文の冒頭を見出し代わりにする（routing.md メタデータ・OG設計）。
 * fallback は本文も空のとき（写真だけの投稿）に使う — 全部同じ文言にならないよう
 * 呼び出し側が作者名などを渡す
 */
export function postDisplayTitle(
  title: string | null,
  bodyJson: unknown,
  fallback = '投稿',
): string {
  const trimmed = title?.trim()
  if (trimmed) return trimmed
  const plain = postPlainText(bodyJson)
  return plain.length > 0 ? truncate(plain, TITLE_FALLBACK_LENGTH) : fallback
}

export function postDescription(bodyJson: unknown): string {
  return truncate(postPlainText(bodyJson), DESCRIPTION_LENGTH)
}

export function toPostDetail(
  row: PostDetailRow,
  toPublicUrl: (path: string) => string,
): PostDetail {
  return {
    id: row.id,
    // CHECK 制約があるので通常 short/blog 以外は来ない。未知の値でレイアウトを
    // 出し分け不能にするより、短文として素直に表示する
    postType: row.post_type === 'blog' ? 'blog' : 'short',
    title: row.title,
    bodyJson: row.body_json,
    visibility: row.visibility,
    // published_at は finalize_post が入れるが、NOT NULL ではないため保険を置く
    publishedAt: row.published_at ?? row.created_at,
    author: {
      id: row.author?.id ?? '',
      username: row.author?.username ?? '',
      displayName: row.author?.display_name ?? '退会したユーザー',
      avatarUrl: row.author?.avatar_url ?? null,
    },
    cafe: row.cafe
      ? { id: row.cafe.id, name: row.cafe.name, areaLabel: row.cafe.areas?.label ?? null }
      : null,
    images: [...row.post_images]
      .sort((a, b) => a.display_order - b.display_order)
      .map((image) => ({
        url: toPublicUrl(image.storage_path),
        // alt の入力導線が無いため実質すべて空（装飾扱い）になる
        //   docs/product/pending-items.md D22
        altText: image.alt_text ?? '',
      })),
    tags: row.post_tags
      .map((entry) => entry.tags)
      .filter((tag): tag is PostDetailTag => tag !== null),
    likeCount: row.like_count,
    likedByViewer: (row.my_like ?? []).length > 0,
    commentCount: row.comment_count,
    bookmarkCount: row.bookmark_count,
    bookmarkedByViewer: (row.my_bookmark ?? []).length > 0,
    isOfficial: row.is_official,
    officialFormat:
      row.is_official && row.official_format && isOfficialFormat(row.official_format)
        ? row.official_format
        : null,
    metadata: row.is_official ? toOfficialMetadata(row.official_format, row.metadata) : null,
  }
}

/**
 * 公開中の投稿を1件取得する。該当行が無ければ null、取得自体に失敗したら例外。
 *
 * 失敗を null に丸めない: 通信エラーや設定ミスまで「投稿が無い」ことにすると、
 * 実在する投稿が静かに 404 になり原因も残らない（キャッシュが効けば404ごと固定される）
 *
 * `status='published'` と `deleted_at is null` は必ずここで明示する。RLS の
 * posts_select_own（author_id 一致のみ）が OR で合成されるため、作者本人が見ると
 * hidden な予約行（reservePost が作る空投稿）や論理削除済みの投稿まで返ってしまう
 *   supabase/migrations/20260910120000_fix_posts_select_own.sql
 *   docs/architecture/data-model/tables.md #posts
 */
export async function getPostDetail(
  supabase: Client,
  postId: string,
  viewerId: string | null = null,
): Promise<PostDetail | null> {
  let query = supabase
    .from('posts')
    .select(buildPostDetailSelect(viewerId))
    .eq('id', postId)
    .eq('status', 'published')
    .is('deleted_at', null)

  // 埋め込みへのフィルタは「返す子行」に効く。投稿そのものは消えない。
  // null を渡すと壊れるので、未ログインでは条件ごと付けない
  if (viewerId) {
    query = query.eq('my_like.user_id', viewerId)
    query = query.eq('my_bookmark.user_id', viewerId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`投稿の取得に失敗しました (id=${postId}): ${error.message}`)
  }
  if (!data) return null

  return toPostDetail(data as unknown as PostDetailRow, (path) =>
    getPostImagePublicUrl(supabase, path),
  )
}

/**
 * いいねの付け外しの後に、権威ある件数を読み直す。
 *
 * 楽観更新の ±1 を確定値で上書きするために使う。クライアントの表示が古いまま押された
 * 場合（別タブで既に操作した等）、±1 だけではズレが残り続ける — 件数の state は
 * props から1度しか初期化されないため router.refresh() でも直らない。
 *
 * 投稿が消えている場合は 0。対象が無いのだから件数も無い
 */
export async function getPostLikeCount(supabase: Client, postId: string): Promise<number> {
  const { data, error } = await supabase
    .from('posts')
    .select('like_count')
    .eq('id', postId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(`いいね数の取得に失敗しました (id=${postId}): ${error.message}`)
  return data?.like_count ?? 0
}

/**
 * 保存の付け外しの後に、権威ある件数を読み直す。getPostLikeCount と同じ理由・同じ形
 */
export async function getPostBookmarkCount(supabase: Client, postId: string): Promise<number> {
  const { data, error } = await supabase
    .from('posts')
    .select('bookmark_count')
    .eq('id', postId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(`保存数の取得に失敗しました (id=${postId}): ${error.message}`)
  return data?.bookmark_count ?? 0
}

/**
 * いいねの対象にしてよい投稿かだけを確かめる軽い問い合わせ（cafeExists の投稿版）。
 *
 * likes.post_id の FK は posts(id) を見るだけで status も deleted_at も見ない。
 * ここで明示しないと posts_select_own（author_id 一致のみ）が OR で合成され、
 * 作者本人に限っては hidden な予約行や論理削除済みの投稿にもいいねが通る
 */
export async function publishedPostExists(supabase: Client, postId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('id', postId)
    .eq('status', 'published')
    .is('deleted_at', null)

  if (error) throw new Error(`投稿の取得に失敗しました (id=${postId}): ${error.message}`)
  return (count ?? 0) > 0
}
