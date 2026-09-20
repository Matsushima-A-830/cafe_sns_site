import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// notifications の発火トリガー（likes / comments / follows）を実 DB に対して動かす。
// 確認したいのは docs/operations の引き継ぎで挙げられた落とし穴:
//  1. 自己いいね・自己コメントで自分宛て通知を作らないこと
//  2. ブロック関係にある相手からは通知を作らないこと（likes/comments はブロックを弾かない）
//  3. user_settings の notify_* が false なら作ってから隠すのではなく最初から作らないこと
//  4. コメント通知は投稿者・親コメント作者の重複を排除すること

const service = serviceRoleClient()
const anon = anonClient()

let author: AuthedUser
let actor: AuthedUser
let blocked: AuthedUser

const postIds: string[] = []
const cleanupNotificationIds: string[] = []

async function insertPost(authorId: string) {
  const { data, error } = await service
    .from('posts')
    .insert({
      author_id: authorId,
      body_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '通知テスト投稿' }] }],
      },
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 posts の作成に失敗: ${error?.message}`)
  postIds.push(data.id)
  return data.id
}

async function notificationsFor(recipientId: string, type: string) {
  const { data, error } = await service
    .from('notifications')
    .select('id, recipient_id, actor_id, type, entity_type, entity_id, read_at')
    .eq('recipient_id', recipientId)
    .eq('type', type)
  if (error) throw new Error(`notifications の取得に失敗: ${error.message}`)
  for (const row of data ?? []) cleanupNotificationIds.push(row.id)
  return data ?? []
}

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'notif_author' })
  actor = await createAuthedProfile({ username: 'notif_actor' })
  blocked = await createAuthedProfile({ username: 'notif_blocked' })
})

afterAll(async () => {
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  await author?.cleanup()
  await actor?.cleanup()
  await blocked?.cleanup()
})

// 各テストが同じ author/actor/blocked を使い回すため、通知を都度クリアしないと
// 前のテストで作られた通知が次のテストの件数アサーションに混ざる
afterEach(async () => {
  await service
    .from('notifications')
    .delete()
    .in('recipient_id', [author.userId, actor.userId, blocked.userId])
})

describe('notify_on_like', () => {
  it('他人の投稿へのいいねで投稿者に通知が作られる', async () => {
    const postId = await insertPost(author.userId)

    await actor.client.from('likes').insert({ user_id: actor.userId, post_id: postId })

    const rows = await notificationsFor(author.userId, 'like')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.actor_id).toBe(actor.userId)
    expect(rows[0]?.entity_type).toBe('post')
    expect(rows[0]?.entity_id).toBe(postId)
  })

  it('自己いいねでは通知が作られない（自分宛てに量産させない）', async () => {
    const postId = await insertPost(author.userId)

    await author.client.from('likes').insert({ user_id: author.userId, post_id: postId })

    expect(await notificationsFor(author.userId, 'like')).toHaveLength(0)
  })

  it('ブロック関係にある相手からのいいねでは通知が作られない', async () => {
    const postId = await insertPost(blocked.userId)
    await service.from('blocks').insert({ blocker_id: blocked.userId, blocked_id: actor.userId })

    await actor.client.from('likes').insert({ user_id: actor.userId, post_id: postId })

    expect(await notificationsFor(blocked.userId, 'like')).toHaveLength(0)

    await service
      .from('blocks')
      .delete()
      .eq('blocker_id', blocked.userId)
      .eq('blocked_id', actor.userId)
  })

  it('notify_like が false なら通知が作られない', async () => {
    const postId = await insertPost(author.userId)
    await service.from('user_settings').update({ notify_like: false }).eq('user_id', author.userId)

    await actor.client.from('likes').insert({ user_id: actor.userId, post_id: postId })

    expect(await notificationsFor(author.userId, 'like')).toHaveLength(0)

    await service.from('user_settings').update({ notify_like: true }).eq('user_id', author.userId)
  })
})

describe('notify_on_follow', () => {
  it('フォローされた人に通知が作られる', async () => {
    await actor.client
      .from('follows')
      .insert({ follower_id: actor.userId, followee_id: author.userId })

    const rows = await notificationsFor(author.userId, 'follow')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.actor_id).toBe(actor.userId)
    expect(rows[0]?.entity_type).toBe('user')
    expect(rows[0]?.entity_id).toBe(actor.userId)

    await service
      .from('follows')
      .delete()
      .eq('follower_id', actor.userId)
      .eq('followee_id', author.userId)
  })

  it('notify_follow が false なら通知が作られない', async () => {
    await service
      .from('user_settings')
      .update({ notify_follow: false })
      .eq('user_id', author.userId)

    await actor.client
      .from('follows')
      .insert({ follower_id: actor.userId, followee_id: author.userId })

    expect(await notificationsFor(author.userId, 'follow')).toHaveLength(0)

    await service.from('user_settings').update({ notify_follow: true }).eq('user_id', author.userId)
    await service
      .from('follows')
      .delete()
      .eq('follower_id', actor.userId)
      .eq('followee_id', author.userId)
  })
})

describe('notify_on_comment', () => {
  it('トップレベルコメントで投稿者に通知が作られる', async () => {
    const postId = await insertPost(author.userId)

    const { data: comment, error } = await actor.client
      .from('comments')
      .insert({ post_id: postId, author_id: actor.userId, body: 'いいですね' })
      .select('id')
      .single()
    expect(error).toBeNull()

    const rows = await notificationsFor(author.userId, 'comment')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.entity_id).toBe(comment?.id)
  })

  it('自己コメントでは通知が作られない', async () => {
    const postId = await insertPost(author.userId)

    await author.client
      .from('comments')
      .insert({ post_id: postId, author_id: author.userId, body: '自分でコメント' })

    expect(await notificationsFor(author.userId, 'comment')).toHaveLength(0)
  })

  it('返信で投稿者と親コメント作者の両方に通知が作られる（別人の場合）', async () => {
    const postId = await insertPost(author.userId)
    const replier = await createAuthedProfile({ username: 'notif_replier' })

    try {
      const { data: parent } = await actor.client
        .from('comments')
        .insert({ post_id: postId, author_id: actor.userId, body: '親コメント' })
        .select('id')
        .single()

      await replier.client.from('comments').insert({
        post_id: postId,
        author_id: replier.userId,
        parent_id: parent?.id,
        body: '返信します',
      })

      // author への通知は「actor の親コメント」「replier の返信」の2件（投稿者は
      // 常に通知対象）。actor への通知は「replier の返信」の1件のみ
      expect(await notificationsFor(author.userId, 'comment')).toHaveLength(2)
      expect(await notificationsFor(actor.userId, 'comment')).toHaveLength(1)
    } finally {
      await replier.cleanup()
    }
  })

  it('投稿者=親コメント作者の場合は重複せず1件だけ通知される', async () => {
    const postId = await insertPost(author.userId)

    const { data: parent } = await author.client
      .from('comments')
      .insert({ post_id: postId, author_id: author.userId, body: '投稿者自身のコメント' })
      .select('id')
      .single()

    await actor.client.from('comments').insert({
      post_id: postId,
      author_id: actor.userId,
      parent_id: parent?.id,
      body: '投稿者への返信',
    })

    expect(await notificationsFor(author.userId, 'comment')).toHaveLength(1)
  })

  it('親コメント作者への返信者自身が親コメント作者の場合は自己送信しない', async () => {
    const postId = await insertPost(author.userId)

    const { data: parent } = await actor.client
      .from('comments')
      .insert({ post_id: postId, author_id: actor.userId, body: '親コメント2' })
      .select('id')
      .single()

    await actor.client.from('comments').insert({
      post_id: postId,
      author_id: actor.userId,
      parent_id: parent?.id,
      body: '自分の親コメントに自分で返信',
    })

    // 投稿者（author）への通知は親コメント・返信それぞれ1件ずつで計2件作られるが、
    // actor 自身（親コメント作者=返信者）への自己送信は作られない
    expect(await notificationsFor(author.userId, 'comment')).toHaveLength(2)
    expect(await notificationsFor(actor.userId, 'comment')).toHaveLength(0)
  })

  it('ブロック関係にある相手からのコメントでは通知が作られない', async () => {
    const postId = await insertPost(blocked.userId)
    await service.from('blocks').insert({ blocker_id: blocked.userId, blocked_id: actor.userId })

    await actor.client
      .from('comments')
      .insert({ post_id: postId, author_id: actor.userId, body: 'ブロック相手からのコメント' })

    expect(await notificationsFor(blocked.userId, 'comment')).toHaveLength(0)

    await service
      .from('blocks')
      .delete()
      .eq('blocker_id', blocked.userId)
      .eq('blocked_id', actor.userId)
  })
})

describe('RLS', () => {
  it('本人以外は通知を読めない', async () => {
    const postId = await insertPost(author.userId)
    await actor.client.from('likes').insert({ user_id: actor.userId, post_id: postId })

    const { data } = await actor.client
      .from('notifications')
      .select('id')
      .eq('recipient_id', author.userId)
    expect(data ?? []).toHaveLength(0)
  })

  it('本人は自分宛ての通知を既読化できる', async () => {
    const postId = await insertPost(author.userId)
    await actor.client.from('likes').insert({ user_id: actor.userId, post_id: postId })
    const [row] = await notificationsFor(author.userId, 'like')

    const { error } = await author.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', row?.id as string)
    expect(error).toBeNull()

    const { data } = await service
      .from('notifications')
      .select('read_at')
      .eq('id', row?.id as string)
      .single()
    expect(data?.read_at).not.toBeNull()
  })

  it('他人は既読化できない（0件の成功で返る）', async () => {
    const postId = await insertPost(author.userId)
    await actor.client.from('likes').insert({ user_id: actor.userId, post_id: postId })
    const [row] = await notificationsFor(author.userId, 'like')

    await actor.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', row?.id as string)

    const { data } = await service
      .from('notifications')
      .select('read_at')
      .eq('id', row?.id as string)
      .single()
    expect(data?.read_at).toBeNull()
  })

  it('未ログインでは読めない', async () => {
    const { data, error } = await anon.from('notifications').select('id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it('recipient_id など read_at 以外の列は更新できない', async () => {
    const postId = await insertPost(author.userId)
    await actor.client.from('likes').insert({ user_id: actor.userId, post_id: postId })
    const [row] = await notificationsFor(author.userId, 'like')

    const { error } = await author.client
      .from('notifications')
      .update({ type: 'follow' })
      .eq('id', row?.id as string)
    expect(error).not.toBeNull()
  })
})
