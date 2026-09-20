import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationFilter } from '@/lib/validators/notifications'
import type { Database } from '@/types/database'

/**
 * 通知一覧（S_NOTIFICATIONS）の読み取り。Server Actions（書き込み用途）ではなく
 * ここに置くのは、ページの Server Component から呼ぶ純粋な読み取りだから
 *   docs/design/wireframes/mypage.md #S_NOTIFICATIONS
 *   supabase/migrations/20260920150000_create_notifications.sql
 *
 * 呼び出し元は必ず閲覧者本人のセッション付きクライアントを渡す。notifications_select_own
 * が recipient のみを通すため、それ以外のクライアントでは常に0件になる
 */

type Client = SupabaseClient<Database>

export const NOTIFICATION_LIST_PAGE_SIZE = 20
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/

export type NotificationListCursor = { createdAt: string; id: string }

export type NotificationActor = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
} | null

export type NotificationItem = {
  id: string
  type: string
  entityType: string | null
  entityId: string | null
  readAt: string | null
  createdAt: string
  actor: NotificationActor
}

export type NotificationListPage = {
  items: NotificationItem[]
  nextCursor: NotificationListCursor | null
}

type NotificationActorRow = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
} | null

type NotificationRow = {
  id: string
  type: string
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
  actor: NotificationActorRow
}

const SELECT = [
  'id, type, entity_type, entity_id, read_at, created_at',
  'actor:profiles!notifications_actor_id_fkey (id, username, display_name, avatar_url)',
].join(', ')

function assertValidCursor(cursor: NotificationListCursor): NotificationListCursor {
  if (!TIMESTAMP_PATTERN.test(cursor.createdAt) || !UUID_PATTERN.test(cursor.id)) {
    throw new Error('通知一覧のカーソルが不正です')
  }
  return cursor
}

function toNotificationActor(row: NotificationActorRow): NotificationActor {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }
}

function toNotificationItem(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
    actor: toNotificationActor(row.actor),
  }
}

/**
 * 通知を新しい順に取得する。取得自体に失敗したら例外（空配列に丸めない）。
 *
 * filter が 'all' 以外なら notifications.type で絞る（フィルタタブ）。
 * recipientId は明示的に渡す（RLS が絞るが、意図を読めるようにする。
 * likes/comments の一覧関数と同じ方針）
 */
export async function getNotificationList(
  supabase: Client,
  recipientId: string,
  options: {
    filter?: NotificationFilter
    cursor?: NotificationListCursor | null
    limit?: number
  } = {},
): Promise<NotificationListPage> {
  const limit = options.limit ?? NOTIFICATION_LIST_PAGE_SIZE

  let query = supabase
    .from('notifications')
    .select(SELECT)
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // 次ページの有無を追加の COUNT なしで判定するため1件多く取る
    .limit(limit + 1)

  if (options.filter && options.filter !== 'all') {
    query = query.eq('type', options.filter)
  }

  if (options.cursor) {
    const cursor = assertValidCursor(options.cursor)
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`通知一覧の取得に失敗しました (recipientId=${recipientId}): ${error.message}`)
  }

  const rows = (data ?? []) as unknown as NotificationRow[]
  const items = rows.slice(0, limit).map(toNotificationItem)
  const last = items.at(-1)

  return {
    items,
    nextCursor: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
  }
}

/** 未読件数。/me からのリンクに添える小さなバッジ表示用（AuthNavには出さない） */
export async function getUnreadNotificationCount(
  supabase: Client,
  recipientId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .is('read_at', null)

  if (error) {
    throw new Error(`未読通知数の取得に失敗しました (recipientId=${recipientId}): ${error.message}`)
  }
  return count ?? 0
}
