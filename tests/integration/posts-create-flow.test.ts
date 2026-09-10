import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

// app/_actions/posts.ts createPost が内部で行う一連の操作
// （posts insert with status='hidden' and explicit id → post_images/post_tags insert →
//  status='published' へ update）を authenticated ロールで直接再現し、RLS/トリガーが
// 設計通りに動くか検証する。createPost 自体は next/headers の cookies() に依存するため
// 素の統合テストから直接呼べない（引き継ぎ参照）

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'
const FOREIGN_KEY_VIOLATION = '23503'

const service = serviceRoleClient()

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'テスト本文' }] }],
}

let alice: AuthedUser
let bob: AuthedUser
let suspendedUser: AuthedUser

const postIds: string[] = []

/** occasion タグを service role で limit 件取得する。seed 不足時に undefined を string
 * として握り潰さないよう、期待件数に満たなければここでテストを失敗させる */
async function occasionTagIds(limit: number): Promise<string[]> {
  const { data } = await service
    .from('tags')
    .select('id')
    .eq('category', 'occasion')
    .order('slug')
    .limit(limit)
  const ids = (data ?? []).map((t) => t.id as string)
  expect(ids).toHaveLength(limit)
  return ids
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_create_flow' })
  bob = await createAuthedProfile({ username: 'bob_create_flow' })
  suspendedUser = await createAuthedProfile({
    username: 'suspended_create_flow',
    status: 'suspended',
  })
})

afterEach(async () => {
  if (postIds.length > 0) {
    await service.from('posts').delete().in('id', postIds)
    postIds.length = 0
  }
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
  await suspendedUser?.cleanup()
})

describe('createPost が再現する一連の操作', () => {
  it('id を明示指定した status=hidden の posts insert は .select() なしで成功する', async () => {
    const postId = crypto.randomUUID()

    const { error } = await alice.client.from('posts').insert({
      id: postId,
      author_id: alice.userId,
      body_json: bodyJson,
      status: 'hidden',
    })

    expect(error).toBeNull()
    postIds.push(postId)
  })

  it('is_post_author() は status=hidden でも作者本人には true を返す（post_images/post_tags の insert が通る）', async () => {
    const postId = crypto.randomUUID()
    await alice.client
      .from('posts')
      .insert({ id: postId, author_id: alice.userId, body_json: bodyJson, status: 'hidden' })
    postIds.push(postId)

    const imageResult = await alice.client
      .from('post_images')
      .insert({ post_id: postId, storage_path: `${alice.userId}/${postId}/a.webp` })
    expect(imageResult.error).toBeNull()

    const [tagId] = await occasionTagIds(1)
    const tagResult = await alice.client
      .from('post_tags')
      .insert({ post_id: postId, tag_id: tagId })
    expect(tagResult.error).toBeNull()
  })

  // 発見した重大なバグ: PostgreSQL の RLS は UPDATE の対象行を選ぶ際にも SELECT
  // ポリシーの USING を適用するため、status='published' のみを許す posts_select の
  // ままでは author_id が一致していても hidden な自分の投稿は UPDATE の対象として
  // 一切見つからず、createPost の「hidden で作成 → published へ更新」の最後の
  // UPDATE が対象0件のまま（エラーなし）成功扱いになり、投稿が永久に非公開のままに
  // なっていた。20260910120000_fix_posts_select_own.sql で author_id 一致なら
  // status を問わず見える posts_select_own を追加して解消した
  // （post_images/post_tags の is_post_author() と同じ考え方）
  it('status=hidden の投稿は作者本人には見えるが、第三者には見えない', async () => {
    const postId = crypto.randomUUID()
    await alice.client
      .from('posts')
      .insert({ id: postId, author_id: alice.userId, body_json: bodyJson, status: 'hidden' })
    postIds.push(postId)

    const own = await alice.client.from('posts').select('id').eq('id', postId)
    expect(own.data).toEqual([{ id: postId }])

    // bob は status='active' の別ユーザー。「suspended だから見えない」と紛れないよう、
    // active な第三者で「作者ではないから見えない」ことを検証する
    const stranger = await bob.client.from('posts').select('id').eq('id', postId)
    expect(stranger.data).toEqual([])
  })

  it('status を published に UPDATE できる（posts_select_own が無いと対象0件のまま無言で失敗する）', async () => {
    const postId = crypto.randomUUID()
    await alice.client
      .from('posts')
      .insert({ id: postId, author_id: alice.userId, body_json: bodyJson, status: 'hidden' })
    postIds.push(postId)

    // createPost の実装と同じく .select() を付けずに呼ぶ。RETURNING の
    // フィルタではなく UPDATE 自体が対象行を見つけられるかを検証する
    const { error } = await alice.client
      .from('posts')
      .update({ status: 'published' })
      .eq('id', postId)
    expect(error).toBeNull()

    const after = await service.from('posts').select('status').eq('id', postId).single()
    expect(after.data?.status).toBe('published')
  })

  // rollbackPost（app/_actions/posts.ts）の posts.delete().eq('id', postId) も
  // 同じ理由（RLS は DELETE の対象行選定にも SELECT ポリシーを適用する）で
  // posts_select_own が無いと hidden な投稿に対して無言で対象0件になり、Storage の
  // 画像だけ消えて posts 行が残るバグになっていた
  it('post_images の上限超過でロールバックする DELETE も hidden な投稿に対して機能する', async () => {
    const postId = crypto.randomUUID()
    await alice.client
      .from('posts')
      .insert({ id: postId, author_id: alice.userId, body_json: bodyJson, status: 'hidden' })
    postIds.push(postId)

    const rows = Array.from({ length: 10 }, (_, i) => ({
      post_id: postId,
      storage_path: `${alice.userId}/${postId}/${i}.webp`,
    }))
    await alice.client.from('post_images').insert(rows)

    const overLimit = await alice.client
      .from('post_images')
      .insert({ post_id: postId, storage_path: `${alice.userId}/${postId}/eleventh.webp` })
    expect(overLimit.error?.code).toBe(RAISED_BY_TRIGGER)

    // rollbackPost の実装と同じく .select() を付けずに呼ぶ
    const rollback = await alice.client.from('posts').delete().eq('id', postId)
    expect(rollback.error).toBeNull()

    const remaining = await service.from('posts').select('id').eq('id', postId)
    expect(remaining.data).toEqual([])
    postIds.length = 0
  })

  it('status=hidden の投稿でも post_images の上限10枚は迂回できない', async () => {
    const postId = crypto.randomUUID()
    await alice.client
      .from('posts')
      .insert({ id: postId, author_id: alice.userId, body_json: bodyJson, status: 'hidden' })
    postIds.push(postId)

    const rows = Array.from({ length: 10 }, (_, i) => ({
      post_id: postId,
      storage_path: `${alice.userId}/${postId}/${i}.webp`,
    }))
    const filled = await alice.client.from('post_images').insert(rows)
    expect(filled.error).toBeNull()

    const { error } = await alice.client
      .from('post_images')
      .insert({ post_id: postId, storage_path: `${alice.userId}/${postId}/eleventh.webp` })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('POST_IMAGES_LIMIT_EXCEEDED')
  })

  it('status=hidden の投稿でも post_tags の上限5個は迂回できない', async () => {
    const postId = crypto.randomUUID()
    await alice.client
      .from('posts')
      .insert({ id: postId, author_id: alice.userId, body_json: bodyJson, status: 'hidden' })
    postIds.push(postId)

    const tagIds = await occasionTagIds(6)

    const rows = tagIds.slice(0, 5).map((tag_id) => ({ post_id: postId, tag_id }))
    const filled = await alice.client.from('post_tags').insert(rows)
    expect(filled.error).toBeNull()

    const { error } = await alice.client
      .from('post_tags')
      .insert({ post_id: postId, tag_id: tagIds[5] })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('POST_TAGS_LIMIT_EXCEEDED')
  })

  it('status=suspended のユーザーは posts insert / post_images insert / post_tags insert / status update すべて RLS で弾かれる', async () => {
    const postId = crypto.randomUUID()

    const postInsert = await suspendedUser.client.from('posts').insert({
      id: postId,
      author_id: suspendedUser.userId,
      body_json: bodyJson,
      status: 'hidden',
    })
    expect(postInsert.error?.code).toBe(RLS_VIOLATION)

    // 続くステップの検証には service role で下準備の hidden 投稿を作る
    await service.from('posts').insert({
      id: postId,
      author_id: suspendedUser.userId,
      body_json: bodyJson,
      status: 'hidden',
    })
    postIds.push(postId)

    const imageInsert = await suspendedUser.client
      .from('post_images')
      .insert({ post_id: postId, storage_path: `${suspendedUser.userId}/${postId}/a.webp` })
    expect(imageInsert.error?.code).toBe(RLS_VIOLATION)

    const [tagId] = await occasionTagIds(1)
    const tagInsert = await suspendedUser.client
      .from('post_tags')
      .insert({ post_id: postId, tag_id: tagId })
    expect(tagInsert.error?.code).toBe(RLS_VIOLATION)

    // createPost の実装（.select() なし）と揃える
    const statusUpdate = await suspendedUser.client
      .from('posts')
      .update({ status: 'published' })
      .eq('id', postId)
    expect(statusUpdate.error?.code).toBe(RLS_VIOLATION)
  })

  it('存在しない cafe_id で insert すると posts_cafe_id_fkey 違反になる（POSTS_CAFE_ID_FKEY 定数の前提）', async () => {
    const postId = crypto.randomUUID()

    const { error } = await alice.client.from('posts').insert({
      id: postId,
      author_id: alice.userId,
      cafe_id: crypto.randomUUID(),
      body_json: bodyJson,
      status: 'hidden',
    })

    expect(error?.code).toBe(FOREIGN_KEY_VIOLATION)
    expect(error?.message).toContain('posts_cafe_id_fkey')
  })

  it('既存の post_images との重複パスは count クエリで検出できる（CONFLICT 事前チェックの前提）', async () => {
    const existingPostId = crypto.randomUUID()
    await alice.client.from('posts').insert({
      id: existingPostId,
      author_id: alice.userId,
      body_json: bodyJson,
      status: 'hidden',
    })
    postIds.push(existingPostId)

    const sharedPath = `${alice.userId}/${existingPostId}/shared.webp`
    await alice.client
      .from('post_images')
      .insert({ post_id: existingPostId, storage_path: sharedPath })

    const { count, error } = await alice.client
      .from('post_images')
      .select('id', { count: 'exact', head: true })
      .in('storage_path', [sharedPath, `${alice.userId}/other/not-used.webp`])

    expect(error).toBeNull()
    expect(count).toBe(1)
  })
})
