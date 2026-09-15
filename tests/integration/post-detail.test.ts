import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getPostDetail } from '@/lib/posts/post-detail'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// lib/posts/post-detail.ts getPostDetail を実 DB に対して動かす。確認したいのは2点:
//  1. PostgREST の埋め込み（author / cafe → areas / post_images / post_tags → tags）が
//     1クエリで解決でき、型アサーションが実データと合っていること
//  2. RLS の posts_select_own（author_id 一致のみで status も deleted_at も見ない）が
//     あっても、作者本人に hidden・論理削除済みの投稿が返らないこと
//     （supabase/migrations/20260910120000_fix_posts_select_own.sql）

const service = serviceRoleClient()

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文テキスト' }] }],
}

let author: AuthedUser
let follower: AuthedUser
let stranger: AuthedUser
let cafeId: string
let tagId: string

const postIds: string[] = []

/** service role で投稿を1件作る。RLS・トリガー自体は posts-create-flow.test.ts の担当なので、
 *  ここでは「その状態の行があるとき getPostDetail がどう振る舞うか」だけを見る */
async function insertPost(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: author.userId,
    post_type: 'short',
    body_json: bodyJson,
    status: 'published',
    published_at: new Date().toISOString(),
    ...overrides,
  })
  if (error) throw new Error(`テスト投稿の作成に失敗: ${error.message}`)
  postIds.push(id)
  return id
}

/** 統合テストのヘルパは型なしクライアントを返すため、呼び出し口で型を付ける */
function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'author_post_detail', display_name: '著者' })
  follower = await createAuthedProfile({ username: 'follower_post_detail' })
  stranger = await createAuthedProfile({ username: 'stranger_post_detail' })

  await service.from('follows').insert({ follower_id: follower.userId, followee_id: author.userId })

  const { data: area } = await service.from('areas').select('code').limit(1).single()
  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({
      name: 'テスト珈琲店',
      prefecture: '東京都',
      city: '渋谷区',
      area_code: area?.code ?? null,
      created_by: author.userId,
    })
    .select('id')
    .single()
  if (cafeError || !cafe) throw new Error(`テストカフェの作成に失敗: ${cafeError?.message}`)
  cafeId = cafe.id as string

  const { data: tag } = await service
    .from('tags')
    .select('id')
    .eq('is_curated', true)
    .limit(1)
    .single()
  if (!tag) throw new Error('curated タグが seed されていない')
  tagId = tag.id as string
})

afterEach(async () => {
  if (postIds.length > 0) {
    await service.from('posts').delete().in('id', postIds)
    postIds.length = 0
  }
})

afterAll(async () => {
  await service.from('cafes').delete().eq('id', cafeId)
  await author?.cleanup()
  await follower?.cleanup()
  await stranger?.cleanup()
})

describe('getPostDetail', () => {
  it('公開投稿を作者・カフェ・エリア・画像・タグ込みで1件返す', async () => {
    const postId = await insertPost({ cafe_id: cafeId, title: null })
    await service.from('post_images').insert([
      { post_id: postId, storage_path: `${author.userId}/${postId}/b.webp`, display_order: 1 },
      { post_id: postId, storage_path: `${author.userId}/${postId}/a.webp`, display_order: 0 },
    ])
    await service.from('post_tags').insert({ post_id: postId, tag_id: tagId })

    const post = await getPostDetail(typed(anonClient()), postId)

    expect(post).not.toBeNull()
    expect(post?.author.displayName).toBe('著者')
    expect(post?.cafe?.name).toBe('テスト珈琲店')
    expect(post?.images).toHaveLength(2)
    expect(post?.images[0]?.url).toContain(`${author.userId}/${postId}/a.webp`)
    expect(post?.tags).toHaveLength(1)
  })

  it('存在しないIDは null', async () => {
    expect(await getPostDetail(typed(anonClient()), crypto.randomUUID())).toBeNull()
  })

  it('hidden な予約行は作者本人にも返さない（posts_select_own の穴を埋める）', async () => {
    const postId = await insertPost({ status: 'hidden', published_at: null })

    expect(await getPostDetail(typed(author.client), postId)).toBeNull()
    expect(await getPostDetail(typed(anonClient()), postId)).toBeNull()
  })

  it('archived な投稿は作者本人にも返さない', async () => {
    const postId = await insertPost({ status: 'archived' })
    expect(await getPostDetail(typed(author.client), postId)).toBeNull()
  })

  it('論理削除済みの投稿は作者本人にも返さない', async () => {
    const postId = await insertPost({ deleted_at: new Date().toISOString() })
    expect(await getPostDetail(typed(author.client), postId)).toBeNull()
  })

  it('フォロワー限定投稿は anon と非フォロワーには返さず、フォロワーと作者には返す', async () => {
    const postId = await insertPost({ visibility: 'followers' })

    expect(await getPostDetail(typed(anonClient()), postId)).toBeNull()
    expect(await getPostDetail(typed(stranger.client), postId)).toBeNull()
    expect(await getPostDetail(typed(follower.client), postId)).not.toBeNull()
    expect(await getPostDetail(typed(author.client), postId)).not.toBeNull()
  })

  it('ブロックしている相手の投稿は返さない（anon で読むと素通りするため必ずセッション付きで読む）', async () => {
    const postId = await insertPost()
    await service.from('blocks').insert({ blocker_id: stranger.userId, blocked_id: author.userId })

    expect(await getPostDetail(typed(stranger.client), postId)).toBeNull()
    // posts_select の `not is_blocked_either_way(author_id)` は auth.uid() が null の
    // anon では常に真になる。ページ側が anon クライアントで先読みするとこの行が
    // ブロック中のユーザーにも見えてしまうため、その設計は採らない
    expect(await getPostDetail(typed(anonClient()), postId)).not.toBeNull()

    await service.from('blocks').delete().eq('blocker_id', stranger.userId)
  })
})
