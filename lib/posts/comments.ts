import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * 投稿詳細（S_POST_DETAIL）のコメントスレッド読み取り。Server Actions（書き込み用途）
 * ではなくここに置くのは、ページの Server Component から呼ぶ純粋な読み取りだから
 *   docs/design/wireframes/browsing.md #S_POST_DETAIL
 *   supabase/migrations/20260920120000_create_comments.sql
 */

type Client = SupabaseClient<Database>

export const COMMENT_LIST_PAGE_SIZE = 20
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/

/** keyset ページング用。トップレベルのコメントだけをページ送りする（返信は親に常に全件付く） */
export type CommentListCursor = { createdAt: string; id: string }

export type CommentAuthor = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export type CommentReply = {
  id: string
  body: string
  isOfficial: boolean
  createdAt: string
  updatedAt: string
  author: CommentAuthor
}

export type CommentItem = CommentReply & {
  replies: CommentReply[]
}

export type CommentListPage = { items: CommentItem[]; nextCursor: CommentListCursor | null }

type CommentAuthorRow = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
} | null

type CommentReplyRow = {
  id: string
  body: string
  is_official: boolean
  created_at: string
  updated_at: string
  author: CommentAuthorRow
}

type CommentRow = CommentReplyRow & {
  replies: CommentReplyRow[]
}

const SELECT = [
  'id, body, is_official, created_at, updated_at',
  'author:profiles!comments_author_id_fkey (id, username, display_name, avatar_url)',
  [
    'replies:comments!parent_id',
    '(id, body, is_official, created_at, updated_at,',
    'author:profiles!comments_author_id_fkey (id, username, display_name, avatar_url))',
  ].join(' '),
].join(', ')

function assertValidCursor(cursor: CommentListCursor): CommentListCursor {
  if (!TIMESTAMP_PATTERN.test(cursor.createdAt) || !UUID_PATTERN.test(cursor.id)) {
    throw new Error('コメント一覧のカーソルが不正です')
  }
  return cursor
}

function toCommentAuthor(row: CommentAuthorRow): CommentAuthor {
  return {
    id: row?.id ?? '',
    username: row?.username ?? '',
    displayName: row?.display_name ?? '退会したユーザー',
    avatarUrl: row?.avatar_url ?? null,
  }
}

function toCommentReply(row: CommentReplyRow): CommentReply {
  return {
    id: row.id,
    body: row.body,
    isOfficial: row.is_official,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: toCommentAuthor(row.author),
  }
}

export function toCommentItem(row: CommentRow): CommentItem {
  return {
    ...toCommentReply(row),
    replies: [...row.replies]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .map(toCommentReply),
  }
}

/**
 * 投稿のコメントスレッドを古い順に取得する。取得自体に失敗したら例外（空配列に丸めない）。
 *
 * `deleted_at is null` は必ずここで明示する。RLS の comments_select_own
 * （author_id 一致 or is_post_author）が OR で合成されるため、省くと閲覧者が
 * 自分のコメント・自分の投稿へのコメントに限って論理削除済みの行まで見えてしまう
 *   docs/architecture/data-model/tables.md #comments
 *
 * ページングはトップレベルのコメント単位で行う。返信は1階層までなので、親コメントの
 * 埋め込みに limit を付けず常に全件返す（親が見えるページにいるなら返信も読めてよい）
 */
export async function getPostComments(
  supabase: Client,
  postId: string,
  options: { cursor?: CommentListCursor | null; limit?: number } = {},
): Promise<CommentListPage> {
  const limit = options.limit ?? COMMENT_LIST_PAGE_SIZE

  let query = supabase
    .from('comments')
    .select(SELECT)
    .eq('post_id', postId)
    .is('deleted_at', null)
    .is('parent_id', null)
    .is('replies.deleted_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .order('created_at', { referencedTable: 'replies', ascending: true })
    // 次ページの有無を追加の COUNT なしで判定するため1件多く取る
    .limit(limit + 1)

  if (options.cursor) {
    const cursor = assertValidCursor(options.cursor)
    query = query.or(
      `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
    )
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`コメント一覧の取得に失敗しました (postId=${postId}): ${error.message}`)
  }

  const rows = (data ?? []) as unknown as CommentRow[]
  const items = rows.slice(0, limit).map(toCommentItem)
  const last = items.at(-1)

  return {
    items,
    nextCursor: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
  }
}

/**
 * コメント投稿フォームが「送信直後にその場で表示する」ための、閲覧者自身の表示情報。
 * createComment は commentId と確定件数しか返さないため（本文はクライアントが既に
 * 持っている）、新規コメントの author 表示はこれで補う。取得できなければ null を返し、
 * 呼び出し元（comment-form.tsx）でプレースホルダ表示に倒す
 */
export async function getCommentAuthorIdentity(
  supabase: Client,
  userId: string,
): Promise<CommentAuthor | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(`ユーザー情報の取得に失敗しました (id=${userId}): ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
  }
}

export type CommentTarget = { id: string; body: string; authorId: string; postId: string }

/**
 * 通報フォーム（S_REPORT_FORM）の対象コメント取得。comments_select_visible
 * （supabase/migrations/20260920120000_create_comments.sql）に乗るセッション付き
 * クライアントで呼ぶこと。ブロック関係にある相手のコメントは自然に0件になり、
 * それがそのまま「対象なし＝404」の根拠になる（service role で読んではいけない）
 */
export async function getCommentById(
  supabase: Client,
  commentId: string,
): Promise<CommentTarget | null> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, author_id, post_id')
    .eq('id', commentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(`コメントの取得に失敗しました (id=${commentId}): ${error.message}`)
  if (!data) return null

  return { id: data.id, body: data.body, authorId: data.author_id, postId: data.post_id }
}

/**
 * コメントの追加・削除の後に、権威ある件数を読み直す。likes の getPostLikeCount と同じ理由
 * — 楽観更新の ±1 を確定値で上書きする
 */
export async function getPostCommentCount(supabase: Client, postId: string): Promise<number> {
  const { data, error } = await supabase
    .from('posts')
    .select('comment_count')
    .eq('id', postId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(`コメント数の取得に失敗しました (postId=${postId}): ${error.message}`)
  return data?.comment_count ?? 0
}
