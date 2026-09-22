import type { SupabaseClient } from '@supabase/supabase-js'
import { isOfficialFormat, type OfficialFormat } from '@/lib/constants/posts'
import { type OfficialMetadata, toOfficialMetadata } from '@/lib/posts/official-metadata'
import { getPostImagePublicUrl } from '@/lib/storage/post-images'
import type { Database } from '@/types/database'

/**
 * フィード（S_HOME / S_EXPLORE）の一覧取得。投稿詳細と同じく Server Component から
 * 呼ぶ純粋な読み取りなので Server Actions ではなくここに置く
 *   docs/design/wireframes/browsing.md #S_HOME #S_EXPLORE
 */

type Client = SupabaseClient<Database>

export const POST_LIST_PAGE_SIZE = 12
const EXCERPT_LENGTH = 120
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// PostgREST が返す timestamptz。now() 由来なのでマイクロ秒（小数6桁）まで来る
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/

export type PostListTag = { id: string; slug: string; label: string }

/** keyset ページング用。offset は件数が増えると遅く、投稿の増減で重複・取りこぼしが出る */
export type PostListCursor = { publishedAt: string; id: string }

export type PostListItem = {
  id: string
  postType: 'short' | 'blog'
  title: string | null
  /** カード用の抜粋。本文の平文を切り詰めたもの（見出し・リストの構造は落とす） */
  excerpt: string
  publishedAt: string
  author: { id: string; username: string; displayName: string; avatarUrl: string | null }
  cafe: { id: string; name: string; areaLabel: string | null } | null
  /** カードに出すのは1枚目だけ。写真なしの短文投稿は null */
  image: { url: string; altText: string } | null
  tags: PostListTag[]
  likeCount: number
  /** 閲覧者自身がいいね済みか。未ログインでは常に false */
  likedByViewer: boolean
  bookmarkCount: number
  /** 閲覧者自身が保存済みか。未ログインでは常に false */
  bookmarkedByViewer: boolean
  /** 経営者による公式投稿か（幹C-2）。true のときのみ officialFormat/metadata が意味を持つ */
  isOfficial: boolean
  officialFormat: OfficialFormat | null
  metadata: OfficialMetadata | null
}

export type PostListPage = { items: PostListItem[]; nextCursor: PostListCursor | null }

export type PostListOptions = {
  /** いずれか1つでも付いている投稿に絞る（気分チップ・おすすめタブ） */
  tagIds?: string[]
  /** カフェ経由のエリア絞り込み。タグではなく areas が正（pending-items D20） */
  areaCode?: string | null
  /** 指定するとこのユーザーがフォローしている作者の投稿だけになる */
  followerId?: string | null
  /** プロフィール（S_USER_PROFILE_PUBLIC）の投稿グリッド。1人の作者に絞る */
  authorId?: string | null
  /** カフェ詳細（S_CAFE_DETAIL）の投稿グリッド。1つのカフェに絞る */
  cafeId?: string | null
  /** カフェ詳細の「オーナーから」セクション用。公式投稿のみに絞る */
  officialOnly?: boolean
  /**
   * 閲覧者。いいね済みかを1クエリで一緒に取るためだけに使う（絞り込みではない）。
   * 未ログインでは渡さない
   */
  viewerId?: string | null
  cursor?: PostListCursor | null
  limit?: number
}

type PostListRow = {
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
  post_images: { storage_path: string; alt_text: string | null }[]
  post_tags: { tags: PostListTag | null }[]
}

export function postExcerpt(bodyText: string | null): string {
  const plain = (bodyText ?? '').replace(/\s+/g, ' ').trim()
  // 絵文字などのサロゲートペアを途中で割らないようコードポイント単位で数える
  const chars = Array.from(plain)
  return chars.length > EXCERPT_LENGTH ? `${chars.slice(0, EXCERPT_LENGTH).join('')}…` : plain
}

/**
 * select 句を組み立てる。絞り込みの有無で `!inner` と埋め込みの数が変わるため定数にできない。
 *
 * タグ絞り込みだけ別名（filter_tags）で2回埋め込むのは、PostgREST が埋め込みリソースへの
 * フィルタを「返す子行」にも適用するため。1つの埋め込みで兼ねるとカードに出すタグが
 * 絞り込み条件のものだけになってしまう
 */
function buildSelect(options: PostListOptions): string {
  const parts = [
    'id, post_type, title, body_text, published_at, created_at, like_count, bookmark_count, is_official, official_format, metadata',
    'author:profiles!posts_author_id_fkey (id, username, display_name, avatar_url)',
    `cafe:cafes!posts_cafe_id_fkey${options.areaCode ? '!inner' : ''} (id, name, area_code, areas!cafes_area_code_fkey (label))`,
    'post_images (storage_path, alt_text)',
    'post_tags (tags (id, slug, label))',
  ]
  if (options.tagIds && options.tagIds.length > 0) {
    parts.push('filter_tags:post_tags!inner (tag_id)')
  }
  if (options.followerId) {
    parts.push(
      'following:profiles!posts_author_id_fkey!inner (follows!follows_followee_id_fkey!inner (follower_id))',
    )
  }
  if (options.viewerId) {
    // ここは `!inner` にしてはいけない。付けると「閲覧者がいいねしていない投稿」が
    // 一覧から丸ごと消える。外側の埋め込みにして、空配列＝未いいね と読む
    parts.push('my_like:likes (user_id)')
    parts.push('my_bookmark:post_bookmarks (user_id)')
  }
  return parts.join(', ')
}

/**
 * カーソルは最終的に PostgREST の `or=(...)` に文字列として埋まる。境界の Zod だけに頼らず、
 * ここでも形を検査してから使う（`,` や `)` を含む値を通さない）。
 *
 * 値そのものは書き換えない。`new Date().toISOString()` を通すとミリ秒に丸まり、
 * posts.published_at（now() 由来でマイクロ秒精度）の下3桁が切り捨てられる。
 * 丸めた値で `published_at.lt.` を投げると、切り捨てた範囲にある未表示の投稿が
 * まるごとページ送りから消える（同ミリ秒の投稿は id のタイブレークにも乗らない）
 */
function assertValidCursor(cursor: PostListCursor): PostListCursor {
  if (!TIMESTAMP_PATTERN.test(cursor.publishedAt) || !UUID_PATTERN.test(cursor.id)) {
    throw new Error('フィードのカーソルが不正です')
  }
  return cursor
}

export function toPostListItem(
  row: PostListRow,
  toPublicUrl: (path: string) => string,
): PostListItem {
  const image = row.post_images[0]

  return {
    id: row.id,
    postType: row.post_type === 'blog' ? 'blog' : 'short',
    title: row.title,
    excerpt: postExcerpt(row.body_text),
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
    // alt の入力導線が無いため実質すべて空（装飾扱い）になる — pending-items D22
    image: image ? { url: toPublicUrl(image.storage_path), altText: image.alt_text ?? '' } : null,
    tags: row.post_tags
      .map((entry) => entry.tags)
      .filter((tag): tag is PostListTag => tag !== null),
    likeCount: row.like_count,
    likedByViewer: (row.my_like ?? []).length > 0,
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
 * 公開中の投稿を新しい順に取得する。取得自体に失敗したら例外（空配列に丸めない）。
 *
 * `status='published'` と `deleted_at is null` を必ずアプリ層で明示する。RLS の
 * posts_select_own（author_id 一致のみ）が OR で合成されるため、省くと作者本人のフィードに
 * hidden な予約行（reservePost が作る空投稿）・archived・論理削除済みが混ざる。
 * 並びを published_at desc にするのも部分インデックス posts_published_idx に合わせるため
 *   supabase/migrations/20260910120000_fix_posts_select_own.sql
 *   docs/architecture/data-model/tables.md #posts
 *
 * 呼び出し元は必ず閲覧者のセッション付きクライアントを渡すこと。anon で読むと
 * posts_select の `not is_blocked_either_way(author_id)` が常に真になり、ブロックした
 * 相手の投稿が見えてしまう（pending-items D23）
 */
export async function getPostList(
  supabase: Client,
  options: PostListOptions = {},
): Promise<PostListPage> {
  const limit = options.limit ?? POST_LIST_PAGE_SIZE

  let query = supabase
    .from('posts')
    .select(buildSelect(options))
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    // 1枚目だけあればよい。埋め込み側の order/limit は親1行ごとに効く
    .order('display_order', { referencedTable: 'post_images', ascending: true })
    .limit(1, { referencedTable: 'post_images' })
    // 次ページの有無を追加の COUNT なしで判定するため1件多く取る
    .limit(limit + 1)

  if (options.tagIds && options.tagIds.length > 0) {
    query = query.in('filter_tags.tag_id', options.tagIds)
  }
  if (options.areaCode) {
    query = query.eq('cafe.area_code', options.areaCode)
  }
  if (options.followerId) {
    query = query.eq('following.follows.follower_id', options.followerId)
  }
  if (options.authorId) {
    query = query.eq('author_id', options.authorId)
  }
  if (options.cafeId) {
    query = query.eq('cafe_id', options.cafeId)
  }
  if (options.officialOnly) {
    query = query.eq('is_official', true)
  }
  if (options.viewerId) {
    // 埋め込みへのフィルタは「返す子行」に効く。親（投稿）の件数は減らない
    query = query.eq('my_like.user_id', options.viewerId)
    query = query.eq('my_bookmark.user_id', options.viewerId)
  }
  if (options.cursor) {
    const cursor = assertValidCursor(options.cursor)
    query = query.or(
      `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`,
    )
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`投稿一覧の取得に失敗しました: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as PostListRow[]
  const items = rows
    .slice(0, limit)
    .map((row) => toPostListItem(row, (path) => getPostImagePublicUrl(supabase, path)))
  const last = items.at(-1)

  return {
    items,
    nextCursor: rows.length > limit && last ? { publishedAt: last.publishedAt, id: last.id } : null,
  }
}
