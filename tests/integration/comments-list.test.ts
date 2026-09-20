import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPostComments } from '@/lib/posts/comments'
import type { Database } from '@/types/database'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

// getPostComments（一覧取得・ページング・返信のネスト・削除済みの除外）を実DBに対して動かす

const service = serviceRoleClient()

let author: AuthedUser
let commenter: AuthedUser
let replier: AuthedUser

const postIds: string[] = []

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

async function insertPost(authorId: string) {
  const { data, error } = await service
    .from('posts')
    .insert({
      author_id: authorId,
      body_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '一覧テスト用投稿' }] }],
      },
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 posts の作成に失敗: ${error?.message}`)
  postIds.push(data.id)
  return data.id
}

async function insertComment(
  postId: string,
  authorId: string,
  body: string,
  overrides: Record<string, unknown> = {},
) {
  const { data, error } = await service
    .from('comments')
    .insert({ post_id: postId, author_id: authorId, body, ...overrides })
    .select('id, created_at')
    .single()
  if (error || !data) throw new Error(`テスト用 comments の作成に失敗: ${error?.message}`)
  return data
}

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'author_clist' })
  commenter = await createAuthedProfile({ username: 'commenter_clist' })
  replier = await createAuthedProfile({ username: 'replier_clist' })
})

afterAll(async () => {
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  await author?.cleanup()
  await commenter?.cleanup()
  await replier?.cleanup()
})

describe('getPostComments', () => {
  it('トップレベルのコメントを古い順に返す', async () => {
    const postId = await insertPost(author.userId)
    const first = await insertComment(postId, commenter.userId, '1つ目')
    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = await insertComment(postId, commenter.userId, '2つ目')

    const page = await getPostComments(typed(author.client), postId)

    expect(page.items.map((item) => item.id)).toEqual([first.id, second.id])
    expect(page.items[0]?.body).toBe('1つ目')
    expect(page.nextCursor).toBeNull()
  })

  it('返信は親コメントの replies に古い順で入れ子になる', async () => {
    const postId = await insertPost(author.userId)
    const parent = await insertComment(postId, commenter.userId, '親')
    const reply1 = await insertComment(postId, replier.userId, '返信1', { parent_id: parent.id })
    await new Promise((resolve) => setTimeout(resolve, 10))
    const reply2 = await insertComment(postId, author.userId, '返信2', { parent_id: parent.id })

    const page = await getPostComments(typed(author.client), postId)

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.replies.map((r) => r.id)).toEqual([reply1.id, reply2.id])
    expect(page.items[0]?.replies[0]?.author.username).toBe('replier_clist')
  })

  it('論理削除済みのコメントは一覧にも返信にも出ない', async () => {
    const postId = await insertPost(author.userId)
    const parent = await insertComment(postId, commenter.userId, '残る親')
    const deletedTop = await insertComment(postId, commenter.userId, '消える予定')
    await service
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedTop.id)

    const deletedReply = await insertComment(postId, replier.userId, '消える返信', {
      parent_id: parent.id,
    })
    await service
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedReply.id)

    const page = await getPostComments(typed(author.client), postId)

    expect(page.items.map((item) => item.id)).toEqual([parent.id])
    expect(page.items[0]?.replies).toEqual([])
  })

  it('is_official が返信・トップレベルどちらにも反映される', async () => {
    const cafeId = crypto.randomUUID()
    await service.from('cafes').insert({
      id: cafeId,
      name: '一覧テスト用カフェ',
      prefecture: '東京都',
      city: '渋谷区',
      verified_owner_id: author.userId,
    })
    const postId = await insertPost(commenter.userId)
    await service.from('posts').update({ cafe_id: cafeId }).eq('id', postId)

    await insertComment(postId, author.userId, '公式のお知らせ', { is_official: true })

    const page = await getPostComments(typed(author.client), postId)

    expect(page.items[0]?.isOfficial).toBe(true)

    await service.from('cafes').delete().eq('id', cafeId)
  })

  it('limit を超えるとカーソルを返し、続きが取得できる', async () => {
    const postId = await insertPost(author.userId)
    const created: { id: string; created_at: string }[] = []
    for (let i = 0; i < 3; i += 1) {
      created.push(await insertComment(postId, commenter.userId, `コメント${i}`))
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const firstPage = await getPostComments(typed(author.client), postId, { limit: 2 })
    expect(firstPage.items.map((item) => item.id)).toEqual([created[0]?.id, created[1]?.id])
    expect(firstPage.nextCursor).not.toBeNull()

    const secondPage = await getPostComments(typed(author.client), postId, {
      limit: 2,
      cursor: firstPage.nextCursor,
    })
    expect(secondPage.items.map((item) => item.id)).toEqual([created[2]?.id])
    expect(secondPage.nextCursor).toBeNull()
  })

  it('コメントが無い投稿は空配列', async () => {
    const postId = await insertPost(author.userId)

    const page = await getPostComments(typed(author.client), postId)

    expect(page.items).toEqual([])
    expect(page.nextCursor).toBeNull()
  })
})
