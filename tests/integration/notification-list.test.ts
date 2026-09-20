import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getNotificationList,
  getUnreadNotificationCount,
} from '@/lib/notifications/notification-list'
import type { Database } from '@/types/database'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

// getNotificationList / getUnreadNotificationCount（一覧・フィルタ・ページング・未読件数）
// を実DBに対して動かす。通知の発火自体は notifications-triggers.test.ts で検証済みなので
// ここでは service role で直接 insert して読み取り側だけを検証する

const service = serviceRoleClient()

let recipient: AuthedUser
let other: AuthedUser
let actor: AuthedUser

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

const notificationIds: string[] = []

async function insertNotification(
  recipientId: string,
  type: 'like' | 'comment' | 'follow',
  overrides: Record<string, unknown> = {},
) {
  const { data, error } = await service
    .from('notifications')
    .insert({ recipient_id: recipientId, actor_id: actor.userId, type, ...overrides })
    .select('id, created_at')
    .single()
  if (error || !data) throw new Error(`テスト用 notifications の作成に失敗: ${error?.message}`)
  notificationIds.push(data.id)
  return data
}

beforeAll(async () => {
  recipient = await createAuthedProfile({ username: 'notif_list_recipient' })
  other = await createAuthedProfile({ username: 'notif_list_other' })
  actor = await createAuthedProfile({ username: 'notif_list_actor' })
})

afterAll(async () => {
  if (notificationIds.length > 0)
    await service.from('notifications').delete().in('id', notificationIds)
  await recipient?.cleanup()
  await other?.cleanup()
  await actor?.cleanup()
})

describe('getNotificationList', () => {
  it('新しい順に返す', async () => {
    const first = await insertNotification(recipient.userId, 'like')
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = await insertNotification(recipient.userId, 'like')

    const page = await getNotificationList(typed(recipient.client), recipient.userId)

    expect(page.items.map((item) => item.id)).toEqual([second.id, first.id])
    expect(page.items[0]?.actor?.username).toBe('notif_list_actor')
    expect(page.nextCursor).toBeNull()
  })

  it('filter で type を絞る（フィルタタブ）', async () => {
    const like = await insertNotification(recipient.userId, 'like')
    const follow = await insertNotification(recipient.userId, 'follow')

    const likeOnly = await getNotificationList(typed(recipient.client), recipient.userId, {
      filter: 'like',
    })
    expect(likeOnly.items.map((item) => item.id)).toContain(like.id)
    expect(likeOnly.items.map((item) => item.id)).not.toContain(follow.id)

    const all = await getNotificationList(typed(recipient.client), recipient.userId, {
      filter: 'all',
    })
    expect(all.items.map((item) => item.id)).toEqual(expect.arrayContaining([like.id, follow.id]))
  })

  it('limit を超えるとカーソルを返し、続きが取得できる', async () => {
    const created: { id: string; created_at: string }[] = []
    for (let i = 0; i < 3; i += 1) {
      created.push(await insertNotification(recipient.userId, 'comment'))
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const firstPage = await getNotificationList(typed(recipient.client), recipient.userId, {
      filter: 'comment',
      limit: 2,
    })
    expect(firstPage.items.map((item) => item.id)).toEqual([created[2]?.id, created[1]?.id])
    expect(firstPage.nextCursor).not.toBeNull()

    const secondPage = await getNotificationList(typed(recipient.client), recipient.userId, {
      filter: 'comment',
      limit: 2,
      cursor: firstPage.nextCursor,
    })
    expect(secondPage.items.map((item) => item.id)).toEqual([created[0]?.id])
    expect(secondPage.nextCursor).toBeNull()
  })

  it('他人の通知は見えない（RLSが効く）', async () => {
    await insertNotification(other.userId, 'like')

    const page = await getNotificationList(typed(recipient.client), other.userId)

    expect(page.items).toEqual([])
  })

  it('通知が無ければ空配列', async () => {
    const page = await getNotificationList(typed(other.client), other.userId, { filter: 'follow' })

    expect(page.items).toEqual([])
    expect(page.nextCursor).toBeNull()
  })
})

describe('getUnreadNotificationCount', () => {
  it('read_at が null の件数だけを数える', async () => {
    const target = await createAuthedProfile({ username: 'notif_unread_target' })
    try {
      const unread = await insertNotification(target.userId, 'like')
      await insertNotification(target.userId, 'follow')
      const read = await insertNotification(target.userId, 'comment')
      await service
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', read.id)

      expect(await getUnreadNotificationCount(typed(target.client), target.userId)).toBe(2)

      await service
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', unread.id)
      expect(await getUnreadNotificationCount(typed(target.client), target.userId)).toBe(1)
    } finally {
      await target.cleanup()
    }
  })
})
