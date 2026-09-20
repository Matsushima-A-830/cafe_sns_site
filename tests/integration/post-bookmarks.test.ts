import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BOOKMARK_PREVIEW_LIMIT,
  getUserBookmarkCount,
  getUserBookmarkedPosts,
} from '@/lib/posts/bookmarks'
import { getPostBookmarkCount, publishedPostExists } from '@/lib/posts/post-detail'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// post_bookmarks の RLS と posts.bookmark_count 維持トリガーを実 DB に対して動かす。
// likes.test.ts と同型だが、確認したいことが1つ増える:
//  1. 他人の投稿への保存でも bookmark_count が増えること（security definer が要る所）
//  2. 保存／解除を繰り返しても bookmark_count と実件数が一致し続けること
//  3. 保存で投稿の updated_at が動かないこと
//  4. 他人の user_id では書けず、suspended は追加できず解除はできること
//  5. likes と異なり SELECT が本人限定であること（likes_select_all のような公開ポリシーが無い）
//  6. 一覧（getUserBookmarkedPosts）・件数（getUserBookmarkCount）が hidden / 論理削除済みの
//     投稿を一致した条件で除外すること（`posts!inner` を省くと件数だけ残ってずれる所）

const service = serviceRoleClient()
const anon = anonClient()

let author: AuthedUser
let bookmarker: AuthedUser
let suspended: AuthedUser

const postIds: string[] = []

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

/** 本文は tiptap_to_plaintext が読める最小の doc。body_json は NOT NULL */
async function insertPost(authorId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from('posts')
    .insert({
      author_id: authorId,
      body_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '保存のテスト投稿' }] }],
      },
      ...overrides,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 posts の作成に失敗: ${error?.message}`)
  postIds.push(data.id)
  return data.id
}

async function bookmarkCountOf(postId: string): Promise<number> {
  const { data, error } = await service
    .from('posts')
    .select('bookmark_count')
    .eq('id', postId)
    .single()
  if (error || !data) throw new Error(`bookmark_count の取得に失敗: ${error?.message}`)
  return data.bookmark_count
}

/** トリガーの結果ではなく post_bookmarks の実件数。突き合わせの基準にする */
async function actualBookmarks(postId: string): Promise<number> {
  const { count, error } = await service
    .from('post_bookmarks')
    .select('post_id', { count: 'exact', head: true })
    .eq('post_id', postId)
  if (error) throw new Error(`post_bookmarks の件数取得に失敗: ${error.message}`)
  return count ?? 0
}

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'author_bookmarks' })
  bookmarker = await createAuthedProfile({ username: 'bookmarker_bookmarks' })
  suspended = await createAuthedProfile({ username: 'suspended_bookmarks', status: 'suspended' })
})

afterAll(async () => {
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  await author?.cleanup()
  await bookmarker?.cleanup()
  await suspended?.cleanup()
})

describe('bookmark_count 維持トリガー', () => {
  it('他人の投稿への保存でも bookmark_count が増える（security definer が要る所）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await bookmarker.client
      .from('post_bookmarks')
      .insert({ user_id: bookmarker.userId, post_id: postId })
    expect(error).toBeNull()

    expect(await bookmarkCountOf(postId)).toBe(1)
    expect(await actualBookmarks(postId)).toBe(1)
  })

  it('自分の投稿にも保存できる（自己保存は許可）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await author.client
      .from('post_bookmarks')
      .insert({ user_id: author.userId, post_id: postId })
    expect(error).toBeNull()
    expect(await bookmarkCountOf(postId)).toBe(1)
  })

  it('解除で減る。連続した追加・解除でも実件数と一致し続ける', async () => {
    const postId = await insertPost(author.userId)

    for (let i = 0; i < 3; i += 1) {
      await bookmarker.client
        .from('post_bookmarks')
        .insert({ user_id: bookmarker.userId, post_id: postId })
      expect(await bookmarkCountOf(postId)).toBe(1)

      await bookmarker.client.from('post_bookmarks').delete().eq('post_id', postId)
      expect(await bookmarkCountOf(postId)).toBe(0)
    }

    expect(await bookmarkCountOf(postId)).toBe(await actualBookmarks(postId))
  })

  it('保存しても投稿の updated_at は動かない（他人の操作で「最終更新」を動かさない）', async () => {
    const postId = await insertPost(author.userId)
    const { data: before } = await service
      .from('posts')
      .select('updated_at')
      .eq('id', postId)
      .single()

    await bookmarker.client
      .from('post_bookmarks')
      .insert({ user_id: bookmarker.userId, post_id: postId })
    const { data: afterBookmark } = await service
      .from('posts')
      .select('updated_at')
      .eq('id', postId)
      .single()
    expect(afterBookmark?.updated_at).toBe(before?.updated_at)

    await bookmarker.client.from('post_bookmarks').delete().eq('post_id', postId)
    const { data: afterUnbookmark } = await service
      .from('posts')
      .select('updated_at')
      .eq('id', postId)
      .single()
    expect(afterUnbookmark?.updated_at).toBe(before?.updated_at)
  })
})

describe('RLS', () => {
  it('保存は本人しか読めない（likes と違い公開ポリシーが無い）', async () => {
    const postId = await insertPost(author.userId)
    await bookmarker.client
      .from('post_bookmarks')
      .insert({ user_id: bookmarker.userId, post_id: postId })

    const { data, error } = await author.client
      .from('post_bookmarks')
      .select('user_id')
      .eq('post_id', postId)
    expect(error).toBeNull()
    expect(data?.length).toBe(0)

    const { data: own } = await bookmarker.client
      .from('post_bookmarks')
      .select('user_id')
      .eq('post_id', postId)
    expect(own?.length).toBe(1)
  })

  it('他人の user_id では書けない', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await bookmarker.client
      .from('post_bookmarks')
      .insert({ user_id: author.userId, post_id: postId })
    expect(error?.code).toBe('42501')
  })

  it('同じ投稿への二重保存は主キー違反', async () => {
    const postId = await insertPost(author.userId)
    await bookmarker.client
      .from('post_bookmarks')
      .insert({ user_id: bookmarker.userId, post_id: postId })

    const { error } = await bookmarker.client
      .from('post_bookmarks')
      .insert({ user_id: bookmarker.userId, post_id: postId })
    expect(error?.code).toBe('23505')
  })

  it('suspended は保存できない（is_active_user が偽）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await suspended.client
      .from('post_bookmarks')
      .insert({ user_id: suspended.userId, post_id: postId })
    expect(error?.code).toBe('42501')
  })

  it('suspended でも解除はできる', async () => {
    const postId = await insertPost(author.userId)
    await service.from('post_bookmarks').insert({ user_id: suspended.userId, post_id: postId })

    const { error } = await suspended.client.from('post_bookmarks').delete().eq('post_id', postId)
    expect(error).toBeNull()
    expect(await actualBookmarks(postId)).toBe(0)
    expect(await bookmarkCountOf(postId)).toBe(0)
  })

  it('他人の保存は削除できない（0件の成功で返る）', async () => {
    const postId = await insertPost(author.userId)
    await service.from('post_bookmarks').insert({ user_id: author.userId, post_id: postId })

    const { error } = await bookmarker.client.from('post_bookmarks').delete().eq('post_id', postId)
    expect(error).toBeNull()
    expect(await actualBookmarks(postId)).toBe(1)
  })

  it('未ログインでは書けない（anon に INSERT ポリシーが無い）', async () => {
    const postId = await insertPost(author.userId)

    const { error } = await anon
      .from('post_bookmarks')
      .insert({ user_id: bookmarker.userId, post_id: postId })
    expect(error?.code).toBe('42501')
  })

  it('未ログインでは読めない（本人限定で anon に SELECT ポリシーが無い）', async () => {
    const postId = await insertPost(author.userId)
    await bookmarker.client
      .from('post_bookmarks')
      .insert({ user_id: bookmarker.userId, post_id: postId })

    const { data, error } = await anon
      .from('post_bookmarks')
      .select('user_id')
      .eq('post_id', postId)
    expect(error).toBeNull()
    expect(data?.length).toBe(0)
  })
})

describe('getUserBookmarkedPosts / getUserBookmarkCount', () => {
  // 専用のユーザーで隔離する。bookmarker は他の describe で既にいくつも保存を作っており、
  // 使い回すと「一覧は公開中の投稿だけ」の期待件数がテストの実行順に左右されてしまう
  let lister: AuthedUser
  let visiblePostId: string
  let hiddenPostId: string
  let deletedPostId: string

  beforeAll(async () => {
    lister = await createAuthedProfile({ username: 'lister_bookmarks' })
    visiblePostId = await insertPost(author.userId, { published_at: '2026-02-05T00:00:00Z' })
    hiddenPostId = await insertPost(author.userId, { status: 'hidden' })
    deletedPostId = await insertPost(author.userId, { deleted_at: '2026-02-04T00:00:00Z' })

    await lister.client
      .from('post_bookmarks')
      .insert({ user_id: lister.userId, post_id: visiblePostId })
    // 予約行・論理削除済みの投稿も保存自体はDB上できてしまう可能性があるので service で直接作る
    await service.from('post_bookmarks').insert({ user_id: lister.userId, post_id: hiddenPostId })
    await service.from('post_bookmarks').insert({ user_id: lister.userId, post_id: deletedPostId })
  })

  afterAll(async () => {
    await lister?.cleanup()
  })

  it('一覧は公開中の投稿だけを返す（hidden・論理削除済みは除外）', async () => {
    const items = await getUserBookmarkedPosts(typed(lister.client), lister.userId)

    expect(items.map((item) => item.id)).toEqual([visiblePostId])
  })

  it('件数バッジは一覧と同じ条件で数える（`posts!inner` を省くと件数だけ残ってずれる所）', async () => {
    const count = await getUserBookmarkCount(typed(lister.client))
    const items = await getUserBookmarkedPosts(typed(lister.client), lister.userId)

    expect(count).toBe(items.length)
  })

  it('プレビュー件数を上限にできる', async () => {
    const items = await getUserBookmarkedPosts(
      typed(lister.client),
      lister.userId,
      BOOKMARK_PREVIEW_LIMIT,
    )

    expect(items.length).toBeLessThanOrEqual(BOOKMARK_PREVIEW_LIMIT)
  })
})

describe('getPostBookmarkCount / publishedPostExists', () => {
  it('トリガーが維持している確定件数を返す', async () => {
    const postId = await insertPost(author.userId)
    await bookmarker.client
      .from('post_bookmarks')
      .insert({ user_id: bookmarker.userId, post_id: postId })

    expect(await getPostBookmarkCount(typed(bookmarker.client), postId)).toBe(1)
  })

  it('消えた投稿は 0（対象が無いのだから件数も無い）', async () => {
    const deletedId = await insertPost(author.userId, { deleted_at: '2026-02-06T00:00:00Z' })

    expect(await getPostBookmarkCount(typed(author.client), deletedId)).toBe(0)
  })

  it('hidden な投稿は作者本人から見ても偽（保存対象にできない）', async () => {
    const hiddenId = await insertPost(author.userId, { status: 'hidden' })

    expect(await publishedPostExists(typed(author.client), hiddenId)).toBe(false)
  })
})
