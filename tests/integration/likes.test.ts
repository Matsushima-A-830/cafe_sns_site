import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPostDetail, getPostLikeCount, publishedPostExists } from '@/lib/posts/post-detail'
import { getPostList } from '@/lib/posts/post-list'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// likes の RLS と posts.like_count 維持トリガーを実 DB に対して動かす。確認したいのは:
//  1. 他人の投稿へのいいねでも like_count が増えること
//     （トリガーが security definer でないと、ここだけ 0件更新で黙って増えない）
//  2. いいね／解除を繰り返しても like_count と実件数が一致し続けること
//  3. いいねで投稿の updated_at が動かないこと
//  4. 他人の user_id では書けず、suspended は追加できず解除はできること
//  5. いいね状態の埋め込み（my_like）が `!inner` でないこと
//     （`!inner` だと「まだいいねしていない投稿」が一覧から丸ごと消える）

const service = serviceRoleClient()
const anon = anonClient()

let author: AuthedUser
let liker: AuthedUser
let suspended: AuthedUser
/** 一覧テスト専用の作者。上のトリガーテストが作る投稿と件数が混ざらないようにする */
let feedAuthor: AuthedUser

let likedPostId: string
let unlikedPostId: string

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

const postIds: string[] = []

/** 本文は tiptap_to_plaintext が読める最小の doc。body_json は NOT NULL */
async function insertPost(authorId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from('posts')
    .insert({
      author_id: authorId,
      body_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'いいねのテスト投稿' }] }],
      },
      ...overrides,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 posts の作成に失敗: ${error?.message}`)
  postIds.push(data.id)
  return data.id
}

async function likeCountOf(postId: string): Promise<number> {
  const { data, error } = await service.from('posts').select('like_count').eq('id', postId).single()
  if (error || !data) throw new Error(`like_count の取得に失敗: ${error?.message}`)
  return data.like_count
}

/** トリガーの結果ではなく likes の実件数。突き合わせの基準にする */
async function actualLikes(postId: string): Promise<number> {
  const { count, error } = await service
    .from('likes')
    .select('post_id', { count: 'exact', head: true })
    .eq('post_id', postId)
  if (error) throw new Error(`likes の件数取得に失敗: ${error.message}`)
  return count ?? 0
}

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'author_likes' })
  liker = await createAuthedProfile({ username: 'liker_likes' })
  suspended = await createAuthedProfile({ username: 'suspended_likes', status: 'suspended' })
  feedAuthor = await createAuthedProfile({ username: 'feed_author_likes' })

  likedPostId = await insertPost(feedAuthor.userId, { published_at: '2026-02-02T00:00:00Z' })
  unlikedPostId = await insertPost(feedAuthor.userId, { published_at: '2026-02-01T00:00:00Z' })

  await liker.client.from('likes').insert({ user_id: liker.userId, post_id: likedPostId })
  // 第三者のいいね。閲覧者自身の likedByViewer に混ざらないことを確かめる
  await author.client.from('likes').insert({ user_id: author.userId, post_id: likedPostId })
})

afterAll(async () => {
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  await author?.cleanup()
  await liker?.cleanup()
  await suspended?.cleanup()
  await feedAuthor?.cleanup()
})

describe('like_count 維持トリガー', () => {
  it('他人の投稿へのいいねでも like_count が増える（security definer が要る所）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await liker.client
      .from('likes')
      .insert({ user_id: liker.userId, post_id: postId })
    expect(error).toBeNull()

    expect(await likeCountOf(postId)).toBe(1)
    expect(await actualLikes(postId)).toBe(1)
  })

  it('自分の投稿にもいいねできる（自己いいねは許可）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await author.client
      .from('likes')
      .insert({ user_id: author.userId, post_id: postId })
    expect(error).toBeNull()
    expect(await likeCountOf(postId)).toBe(1)
  })

  it('解除で減る。連続した追加・解除でも実件数と一致し続ける', async () => {
    const postId = await insertPost(author.userId)

    for (let i = 0; i < 3; i += 1) {
      await liker.client.from('likes').insert({ user_id: liker.userId, post_id: postId })
      expect(await likeCountOf(postId)).toBe(1)

      await liker.client.from('likes').delete().eq('post_id', postId)
      expect(await likeCountOf(postId)).toBe(0)
    }

    expect(await likeCountOf(postId)).toBe(await actualLikes(postId))
  })

  it('複数人のいいねを数える', async () => {
    const postId = await insertPost(author.userId)

    await liker.client.from('likes').insert({ user_id: liker.userId, post_id: postId })
    await author.client.from('likes').insert({ user_id: author.userId, post_id: postId })

    expect(await likeCountOf(postId)).toBe(2)
    expect(await actualLikes(postId)).toBe(2)
  })

  it('いいねしても投稿の updated_at は動かない（他人の操作で「最終更新」を動かさない）', async () => {
    const postId = await insertPost(author.userId)
    const { data: before } = await service
      .from('posts')
      .select('updated_at')
      .eq('id', postId)
      .single()

    await liker.client.from('likes').insert({ user_id: liker.userId, post_id: postId })
    const { data: afterLike } = await service
      .from('posts')
      .select('updated_at')
      .eq('id', postId)
      .single()
    expect(afterLike?.updated_at).toBe(before?.updated_at)

    await liker.client.from('likes').delete().eq('post_id', postId)
    const { data: afterUnlike } = await service
      .from('posts')
      .select('updated_at')
      .eq('id', postId)
      .single()
    expect(afterUnlike?.updated_at).toBe(before?.updated_at)
  })

  it('本文の更新では updated_at が動く（WHEN 句で止めすぎていない）', async () => {
    const postId = await insertPost(author.userId)
    const { data: before } = await service
      .from('posts')
      .select('updated_at')
      .eq('id', postId)
      .single()

    await service.from('posts').update({ title: '書き換えたタイトル' }).eq('id', postId)
    const { data: after } = await service
      .from('posts')
      .select('updated_at')
      .eq('id', postId)
      .single()

    expect(after?.updated_at).not.toBe(before?.updated_at)
  })
})

describe('RLS', () => {
  it('いいねは全ユーザーが読める（未ログインでも）', async () => {
    const postId = await insertPost(author.userId)
    await liker.client.from('likes').insert({ user_id: liker.userId, post_id: postId })

    const { data, error } = await anon.from('likes').select('user_id').eq('post_id', postId)
    expect(error).toBeNull()
    expect(data?.length).toBe(1)
  })

  it('他人の user_id では書けない', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await liker.client
      .from('likes')
      .insert({ user_id: author.userId, post_id: postId })
    expect(error?.code).toBe('42501')
  })

  it('同じ投稿への二重いいねは主キー違反', async () => {
    const postId = await insertPost(author.userId)
    await liker.client.from('likes').insert({ user_id: liker.userId, post_id: postId })

    const { error } = await liker.client
      .from('likes')
      .insert({ user_id: liker.userId, post_id: postId })
    expect(error?.code).toBe('23505')
  })

  it('suspended はいいねできない（is_active_user が偽）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await suspended.client
      .from('likes')
      .insert({ user_id: suspended.userId, post_id: postId })
    expect(error?.code).toBe('42501')
  })

  it('suspended でも解除はできる', async () => {
    const postId = await insertPost(author.userId)
    await service.from('likes').insert({ user_id: suspended.userId, post_id: postId })

    const { error } = await suspended.client.from('likes').delete().eq('post_id', postId)
    expect(error).toBeNull()
    expect(await actualLikes(postId)).toBe(0)
    expect(await likeCountOf(postId)).toBe(0)
  })

  it('他人のいいねは削除できない（0件の成功で返る）', async () => {
    const postId = await insertPost(author.userId)
    await service.from('likes').insert({ user_id: author.userId, post_id: postId })

    const { error } = await liker.client.from('likes').delete().eq('post_id', postId)
    expect(error).toBeNull()
    expect(await actualLikes(postId)).toBe(1)
  })

  it('未ログインでは書けない（anon に INSERT ポリシーが無い）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await anon.from('likes').insert({ user_id: liker.userId, post_id: postId })
    expect(error?.code).toBe('42501')
  })
})

describe('いいね状態の埋め込み（getPostList）', () => {
  it('いいねしていない投稿も一覧に残る（`!inner` を付けると消える所）', async () => {
    const page = await getPostList(typed(liker.client), {
      authorId: feedAuthor.userId,
      viewerId: liker.userId,
    })

    expect(page.items.map((item) => item.id)).toEqual([likedPostId, unlikedPostId])
  })

  it('いいね済みだけ likedByViewer が真になる', async () => {
    const page = await getPostList(typed(liker.client), {
      authorId: feedAuthor.userId,
      viewerId: liker.userId,
    })

    expect(page.items.find((item) => item.id === likedPostId)?.likedByViewer).toBe(true)
    expect(page.items.find((item) => item.id === unlikedPostId)?.likedByViewer).toBe(false)
  })

  it('他人のいいねは自分の likedByViewer に混ざらない', async () => {
    // likedPostId には liker と author の2人がいいねしている。author 視点では
    // 自分のいいねだけが見え、件数は2のまま
    const page = await getPostList(typed(feedAuthor.client), {
      authorId: feedAuthor.userId,
      viewerId: feedAuthor.userId,
    })

    expect(page.items.find((item) => item.id === likedPostId)?.likedByViewer).toBe(false)
    expect(page.items.find((item) => item.id === likedPostId)?.likeCount).toBe(2)
  })

  it('viewerId を渡さなければ likedByViewer は常に false（投稿は消えない）', async () => {
    const page = await getPostList(typed(liker.client), { authorId: feedAuthor.userId })

    expect(page.items.map((item) => item.id)).toEqual([likedPostId, unlikedPostId])
    expect(page.items.every((item) => item.likedByViewer === false)).toBe(true)
  })

  it('未ログインでも一覧は引ける（埋め込みフィルタを付けない経路）', async () => {
    const page = await getPostList(typed(anon), { authorId: feedAuthor.userId })

    expect(page.items.map((item) => item.id)).toEqual([likedPostId, unlikedPostId])
    expect(page.items.find((item) => item.id === likedPostId)?.likeCount).toBe(2)
  })
})

describe('いいね状態の埋め込み（getPostDetail）', () => {
  it('いいねしていない投稿でも 404 にならない', async () => {
    const detail = await getPostDetail(typed(liker.client), unlikedPostId, liker.userId)

    expect(detail?.id).toBe(unlikedPostId)
    expect(detail?.likedByViewer).toBe(false)
    expect(detail?.likeCount).toBe(0)
  })

  it('いいね済みなら likedByViewer が真', async () => {
    const detail = await getPostDetail(typed(liker.client), likedPostId, liker.userId)

    expect(detail?.likedByViewer).toBe(true)
    expect(detail?.likeCount).toBe(2)
  })

  it('未ログインでも引ける', async () => {
    const detail = await getPostDetail(typed(anon), likedPostId)

    expect(detail?.id).toBe(likedPostId)
    expect(detail?.likedByViewer).toBe(false)
  })
})

describe('getPostLikeCount', () => {
  it('トリガーが維持している確定件数を返す', async () => {
    expect(await getPostLikeCount(typed(liker.client), likedPostId)).toBe(2)
    expect(await getPostLikeCount(typed(liker.client), unlikedPostId)).toBe(0)
  })

  it('未ログインでも読める（件数は公開情報）', async () => {
    expect(await getPostLikeCount(typed(anon), likedPostId)).toBe(2)
  })

  it('消えた投稿は 0（対象が無いのだから件数も無い）', async () => {
    const deletedId = await insertPost(feedAuthor.userId, { deleted_at: '2026-02-04T00:00:00Z' })

    expect(await getPostLikeCount(typed(feedAuthor.client), deletedId)).toBe(0)
  })
})

describe('publishedPostExists', () => {
  it('公開中の投稿は真', async () => {
    expect(await publishedPostExists(typed(liker.client), likedPostId)).toBe(true)
  })

  it('hidden な投稿は作者本人から見ても偽（posts_select_own のすり抜けを塞ぐ）', async () => {
    const hiddenId = await insertPost(feedAuthor.userId, { status: 'hidden' })

    expect(await publishedPostExists(typed(feedAuthor.client), hiddenId)).toBe(false)
  })

  it('論理削除済みの投稿は作者本人から見ても偽', async () => {
    const deletedId = await insertPost(feedAuthor.userId, { deleted_at: '2026-02-03T00:00:00Z' })

    expect(await publishedPostExists(typed(feedAuthor.client), deletedId)).toBe(false)
  })
})
