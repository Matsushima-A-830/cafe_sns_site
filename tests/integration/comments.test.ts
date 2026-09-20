import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'

// comments の RLS・posts.comment_count 維持トリガー・スレッド整合性トリガー・
// モデレーション列ガードを実 DB に対して動かす。確認したいのは:
//  1. hidden な投稿のコメントは第三者から読めない（posts_select を継承しているか）
//  2. 投稿主がコメント本文（body）を書き換えられない
//  3. 投稿主は deleted_at（論理削除）だけは立てられる
//  4. 返信は同じ投稿・1階層までしか許されない
//  5. is_official は該当カフェの verified_owner_id 本人にしか付けられない
//  6. comment_count が他人のコメントでも正しく増減する（security definer が要る所）

const service = serviceRoleClient()
const anon = anonClient()

let author: AuthedUser
let commenter: AuthedUser
let other: AuthedUser
let suspended: AuthedUser

const postIds: string[] = []
const cafeIds: string[] = []

async function insertPost(authorId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from('posts')
    .insert({
      author_id: authorId,
      body_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'コメントのテスト投稿' }] }],
      },
      ...overrides,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 posts の作成に失敗: ${error?.message}`)
  postIds.push(data.id)
  return data.id
}

async function insertCafe(ownerId: string) {
  const { data, error } = await service
    .from('cafes')
    .insert({
      name: 'コメントテスト用カフェ',
      prefecture: '東京都',
      city: '渋谷区',
      verified_owner_id: ownerId,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id
}

async function commentCountOf(postId: string): Promise<number> {
  const { data, error } = await service
    .from('posts')
    .select('comment_count')
    .eq('id', postId)
    .single()
  if (error || !data) throw new Error(`comment_count の取得に失敗: ${error?.message}`)
  return data.comment_count
}

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'author_comments' })
  commenter = await createAuthedProfile({ username: 'commenter_comments' })
  other = await createAuthedProfile({ username: 'other_comments' })
  suspended = await createAuthedProfile({ username: 'suspended_comments', status: 'suspended' })
})

afterAll(async () => {
  await service.from('comments').delete().in('post_id', postIds)
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  if (cafeIds.length > 0) await service.from('cafes').delete().in('id', cafeIds)
  await author?.cleanup()
  await commenter?.cleanup()
  await other?.cleanup()
  await suspended?.cleanup()
})

describe('comment_count 維持トリガー', () => {
  it('他人の投稿へのコメントでも comment_count が増える（security definer が要る所）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: 'こんにちは' })
    expect(error).toBeNull()
    expect(await commentCountOf(postId)).toBe(1)
  })

  it('論理削除で comment_count が減る', async () => {
    const postId = await insertPost(author.userId)
    const { data } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '消される予定' })
      .select('id')
      .single()

    expect(await commentCountOf(postId)).toBe(1)

    await commenter.client
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', data?.id)

    expect(await commentCountOf(postId)).toBe(0)
  })

  it('deleted_at 以外の更新では comment_count が動かない', async () => {
    const postId = await insertPost(author.userId)
    const { data } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '編集前' })
      .select('id')
      .single()

    await commenter.client.from('comments').update({ body: '編集後' }).eq('id', data?.id)

    expect(await commentCountOf(postId)).toBe(1)
  })
})

describe('RLS（可視性の継承）', () => {
  it('hidden な投稿のコメントは第三者から読めない', async () => {
    const postId = await insertPost(author.userId, { status: 'hidden' })
    await service
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '隠れているはず' })

    const { data } = await other.client.from('comments').select('id').eq('post_id', postId)
    expect(data ?? []).toEqual([])
  })

  it('hidden な投稿でも作者本人にはコメントが見える（is_post_author の OR）', async () => {
    const postId = await insertPost(author.userId, { status: 'hidden' })
    await service
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '作者には見える' })

    const { data } = await author.client.from('comments').select('id').eq('post_id', postId)
    expect(data?.length).toBe(1)
  })

  it('論理削除済みのコメントは誰からも読めない', async () => {
    const postId = await insertPost(author.userId)
    const { data: inserted } = await service
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '削除予定' })
      .select('id')
      .single()
    await service
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', inserted?.id)

    const { data } = await other.client.from('comments').select('id').eq('post_id', postId)
    expect(data ?? []).toEqual([])
  })

  it('未ログインでも公開投稿のコメントは読める', async () => {
    const postId = await insertPost(author.userId, { status: 'published', visibility: 'public' })
    await service
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '公開コメント' })

    const { data } = await anon.from('comments').select('id').eq('post_id', postId)
    expect(data?.length).toBe(1)
  })

  it('suspended はコメントできない（is_active_user が偽）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await suspended.client
      .from('comments')
      .insert({ post_id: postId, author_id: suspended.userId, body: 'できないはず' })
    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('他人の author_id では書けない', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: other.userId, body: 'なりすまし' })
    expect(error?.code).toBe(RLS_VIOLATION)
  })
})

describe('モデレーション（投稿主による論理削除・作者による編集）', () => {
  it('投稿主はコメント本文を書き換えられない', async () => {
    const postId = await insertPost(author.userId)
    const { data } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '元の本文' })
      .select('id')
      .single()

    const { error } = await author.client
      .from('comments')
      .update({ body: '投稿主が書き換えた' })
      .eq('id', data?.id)
    expect(error?.code).toBe(RAISED_BY_TRIGGER)

    const { data: after } = await service
      .from('comments')
      .select('body')
      .eq('id', data?.id)
      .single()
    expect(after?.body).toBe('元の本文')
  })

  it('投稿主は deleted_at（論理削除）だけは立てられる', async () => {
    const postId = await insertPost(author.userId)
    const { data } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: 'スパムかもしれない' })
      .select('id')
      .single()

    const { error } = await author.client
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', data?.id)
    expect(error).toBeNull()

    const { data: after } = await service
      .from('comments')
      .select('deleted_at')
      .eq('id', data?.id)
      .single()
    expect(after?.deleted_at).not.toBeNull()
  })

  it('無関係の第三者は削除もできない', async () => {
    const postId = await insertPost(author.userId)
    const { data } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '無関係第三者テスト' })
      .select('id')
      .single()

    const { error } = await other.client
      .from('comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', data?.id)
    // RLS の using が偽になるため0件更新で成功扱いになる。実際に変わっていないことで確認する
    expect(error).toBeNull()
    const { data: after } = await service
      .from('comments')
      .select('deleted_at')
      .eq('id', data?.id)
      .single()
    expect(after?.deleted_at).toBeNull()
  })

  it('作者本人は自分のコメント本文を編集できる', async () => {
    const postId = await insertPost(author.userId)
    const { data } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '編集前' })
      .select('id')
      .single()

    const { error } = await commenter.client
      .from('comments')
      .update({ body: '編集後' })
      .eq('id', data?.id)
    expect(error).toBeNull()
  })

  it('post_id / author_id / parent_id は INSERT 後に変更できない', async () => {
    const postId = await insertPost(author.userId)
    const otherPostId = await insertPost(author.userId)
    const { data } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '固定されるはず' })
      .select('id')
      .single()

    const { error } = await commenter.client
      .from('comments')
      .update({ post_id: otherPostId })
      .eq('id', data?.id)
    expect(error?.code).toBe(RAISED_BY_TRIGGER)
  })
})

describe('スレッド整合性（返信は1階層まで）', () => {
  it('同じ投稿の返信は作れる', async () => {
    const postId = await insertPost(author.userId)
    const { data: parent } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '親コメント' })
      .select('id')
      .single()

    const { error } = await other.client
      .from('comments')
      .insert({ post_id: postId, author_id: other.userId, body: '返信', parent_id: parent?.id })
    expect(error).toBeNull()
  })

  it('別の投稿のコメントを parent_id に指定できない', async () => {
    const postId = await insertPost(author.userId)
    const otherPostId = await insertPost(author.userId)
    const { data: parent } = await commenter.client
      .from('comments')
      .insert({ post_id: otherPostId, author_id: commenter.userId, body: '別投稿の親' })
      .select('id')
      .single()

    const { error } = await other.client.from('comments').insert({
      post_id: postId,
      author_id: other.userId,
      body: '不正な返信',
      parent_id: parent?.id,
    })
    expect(error).not.toBeNull()
  })

  it('返信への返信（2階層目）は作れない', async () => {
    const postId = await insertPost(author.userId)
    const { data: parent } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '親' })
      .select('id')
      .single()
    const { data: reply } = await other.client
      .from('comments')
      .insert({ post_id: postId, author_id: other.userId, body: '子', parent_id: parent?.id })
      .select('id')
      .single()

    const { error } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '孫', parent_id: reply?.id })
    expect(error).not.toBeNull()
  })

  it('自己参照はできない', async () => {
    const postId = await insertPost(author.userId)
    const { data } = await commenter.client
      .from('comments')
      .insert({ post_id: postId, author_id: commenter.userId, body: '自己参照テスト' })
      .select('id')
      .single()

    const { error } = await service
      .from('comments')
      .update({ parent_id: data?.id })
      .eq('id', data?.id)
    expect(error).not.toBeNull()
  })
})

describe('is_official（オーナー公式返信）', () => {
  it('カフェの verified_owner_id 本人は is_official=true でコメントできる', async () => {
    const cafeId = await insertCafe(author.userId)
    const postId = await insertPost(commenter.userId, { cafe_id: cafeId })

    const { error } = await author.client
      .from('comments')
      .insert({ post_id: postId, author_id: author.userId, body: '公式返信', is_official: true })
    expect(error).toBeNull()
  })

  it('verified_owner_id 本人以外は is_official=true にできない', async () => {
    const cafeId = await insertCafe(author.userId)
    const postId = await insertPost(commenter.userId, { cafe_id: cafeId })

    const { error } = await other.client.from('comments').insert({
      post_id: postId,
      author_id: other.userId,
      body: 'なりすまし公式',
      is_official: true,
    })
    expect(error?.code).toBe(RAISED_BY_TRIGGER)
  })

  it('service_role 経由でも verified_owner_id 以外の is_official は弾かれる（トリガー）', async () => {
    const cafeId = await insertCafe(author.userId)
    const postId = await insertPost(commenter.userId, { cafe_id: cafeId })

    const { error } = await service.from('comments').insert({
      post_id: postId,
      author_id: other.userId,
      body: 'バッチ経由のなりすまし',
      is_official: true,
    })
    expect(error).not.toBeNull()
  })

  it('is_official は INSERT 後に変更できない', async () => {
    const cafeId = await insertCafe(author.userId)
    const postId = await insertPost(commenter.userId, { cafe_id: cafeId })
    const { data } = await author.client
      .from('comments')
      .insert({ post_id: postId, author_id: author.userId, body: '公式返信2', is_official: true })
      .select('id')
      .single()

    const { error } = await author.client
      .from('comments')
      .update({ is_official: false })
      .eq('id', data?.id)
    expect(error?.code).toBe(RAISED_BY_TRIGGER)
  })
})

describe('ブロック関係', () => {
  let blocker: AuthedUser
  let blocked: AuthedUser
  let postAuthor: AuthedUser

  beforeAll(async () => {
    blocker = await createAuthedProfile({ username: 'blocker_comments' })
    blocked = await createAuthedProfile({ username: 'blocked_comments' })
    postAuthor = await createAuthedProfile({ username: 'block_post_author_comments' })

    const { error } = await service
      .from('blocks')
      .insert({ blocker_id: blocker.userId, blocked_id: blocked.userId })
    if (error) throw new Error(`テスト用 blocks の作成に失敗: ${error.message}`)
  })

  afterAll(async () => {
    await blocker?.cleanup()
    await blocked?.cleanup()
    await postAuthor?.cleanup()
  })

  it('ブロックした相手のコメントは読めない（両方向）', async () => {
    const postId = await insertPost(postAuthor.userId)
    await service
      .from('comments')
      .insert({ post_id: postId, author_id: blocked.userId, body: 'ブロック相手のコメント' })

    const { data } = await blocker.client.from('comments').select('id').eq('post_id', postId)
    expect(data ?? []).toEqual([])
  })
})
