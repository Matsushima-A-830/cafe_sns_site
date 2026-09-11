import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

// app/_actions/posts.ts reservePost（posts insert with status='hidden' and explicit id）と
// createPost（Postgres 関数 finalize_post の RPC 呼び出し）が内部で行う操作を
// authenticated ロールで直接再現・呼び出しし、RLS/トリガー/行ロックが設計通りに
// 動くか検証する。reservePost/createPost 自体は next/headers の cookies() に依存するため
// 素の統合テストから直接呼べない（docs/product/pending-items.md D17）
//
// finalize_post は本文更新・post_images/post_tags insert・公開更新を1トランザクション
// にまとめた RPC（supabase/migrations/20260911134931_finalize_post_rpc.sql）。
// 冒頭より前は「reservePost が作る hidden 予約行」と「post_images/post_tags の
// RLS・上限トリガー」が個々に正しく動くことを、この後半は finalize_post 自体の
// 認可・原子性・同時実行時の直列化を検証する

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

  // RLS は DELETE の対象行選定にも SELECT ポリシーを適用するため、posts_select_own が
  // 無いと hidden な投稿に対して無言で対象0件になる。finalize_post（RPC）は失敗時に
  // 関数全体が自動ロールバックするため posts 行自体を消す処理はもう無いが、
  // 放置された hidden 予約行の掃除（D19、未実装）はこの DELETE に依存することになるため、
  // hidden な自分の投稿に対して DELETE が機能することは引き続き検証しておく
  it('hidden な自分の投稿に対して DELETE が機能する（D19 の掃除処理が依存する前提）', async () => {
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

    // .select() を付けずに呼ぶ（DELETE 自体が対象行を見つけられるかを検証する）
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

  type FinalizePostArgs = {
    p_post_id: string
    p_post_type: string
    p_title: string | null
    p_body_json: typeof bodyJson
    p_visibility: string
    p_cafe_id: string | null
    p_image_paths: string[]
    p_tag_ids: string[]
  }

  function finalizeArgs(
    postId: string,
    overrides: Partial<FinalizePostArgs> = {},
  ): FinalizePostArgs {
    return {
      p_post_id: postId,
      p_post_type: 'short',
      p_title: null,
      p_body_json: bodyJson,
      p_visibility: 'public',
      p_cafe_id: null,
      p_image_paths: [],
      p_tag_ids: [],
      ...overrides,
    }
  }

  describe('finalize_post RPC', () => {
    it('hidden な予約行を本文/画像/タグ込みで published に確定できる', async () => {
      const postId = crypto.randomUUID()
      await alice.client.from('posts').insert({
        id: postId,
        author_id: alice.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'hidden',
      })
      postIds.push(postId)

      const [tagId] = await occasionTagIds(1)
      const path = `${alice.userId}/${postId}/a.webp`

      const { error } = await alice.client.rpc(
        'finalize_post',
        finalizeArgs(postId, { p_image_paths: [path], p_tag_ids: [tagId as string] }),
      )
      expect(error).toBeNull()

      const after = await service.from('posts').select('status').eq('id', postId).single()
      expect(after.data?.status).toBe('published')

      const images = await service.from('post_images').select('storage_path').eq('post_id', postId)
      expect(images.data).toEqual([{ storage_path: path }])

      const tags = await service.from('post_tags').select('tag_id').eq('post_id', postId)
      expect(tags.data).toEqual([{ tag_id: tagId }])
    })

    it('既に published な投稿への finalize は対象0件で FORBIDDEN(P0001) になる（二重送信対策）', async () => {
      const postId = crypto.randomUUID()
      await alice.client.from('posts').insert({
        id: postId,
        author_id: alice.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'published',
      })
      postIds.push(postId)

      const { error } = await alice.client.rpc('finalize_post', finalizeArgs(postId))

      expect(error?.code).toBe(RAISED_BY_TRIGGER)
      expect(error?.message).toContain('FORBIDDEN')
    })

    it('他人が予約した hidden 投稿への finalize は RLS(posts_select_own) 越しに対象0件で FORBIDDEN になる', async () => {
      const postId = crypto.randomUUID()
      await service.from('posts').insert({
        id: postId,
        author_id: bob.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'hidden',
      })
      postIds.push(postId)

      const { error } = await alice.client.rpc('finalize_post', finalizeArgs(postId))

      expect(error?.code).toBe(RAISED_BY_TRIGGER)
      expect(error?.message).toContain('FORBIDDEN')
    })

    it('short で予約した投稿を blog として finalize しようとすると post_type 不一致で FORBIDDEN になる', async () => {
      const postId = crypto.randomUUID()
      await alice.client.from('posts').insert({
        id: postId,
        author_id: alice.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'hidden',
      })
      postIds.push(postId)

      const { error } = await alice.client.rpc(
        'finalize_post',
        finalizeArgs(postId, { p_post_type: 'blog', p_title: 'ブログのつもり' }),
      )

      expect(error?.code).toBe(RAISED_BY_TRIGGER)
      expect(error?.message).toContain('FORBIDDEN')

      // 対象が見つからず即 raise するため、本文も更新されず hidden のまま残る
      const after = await service.from('posts').select('status, title').eq('id', postId).single()
      expect(after.data).toEqual({ status: 'hidden', title: null })
    })

    it('存在しない cafe_id を指定すると FK違反(23503)になり、関数全体がロールバックされる（画像も挿入されない）', async () => {
      const postId = crypto.randomUUID()
      await alice.client.from('posts').insert({
        id: postId,
        author_id: alice.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'hidden',
      })
      postIds.push(postId)

      const path = `${alice.userId}/${postId}/a.webp`
      const { error } = await alice.client.rpc(
        'finalize_post',
        finalizeArgs(postId, { p_cafe_id: crypto.randomUUID(), p_image_paths: [path] }),
      )

      expect(error?.code).toBe(FOREIGN_KEY_VIOLATION)
      expect(error?.message).toContain('posts_cafe_id_fkey')

      const after = await service.from('posts').select('status').eq('id', postId).single()
      expect(after.data?.status).toBe('hidden')
      const images = await service.from('post_images').select('id').eq('post_id', postId)
      expect(images.data).toEqual([])
    })

    it('画像11枚で上限超過(P0001)になり、関数全体がロールバックされる（10枚とも挿入されない）', async () => {
      const postId = crypto.randomUUID()
      await alice.client.from('posts').insert({
        id: postId,
        author_id: alice.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'hidden',
      })
      postIds.push(postId)

      const paths = Array.from({ length: 11 }, (_, i) => `${alice.userId}/${postId}/${i}.webp`)
      const { error } = await alice.client.rpc(
        'finalize_post',
        finalizeArgs(postId, { p_image_paths: paths }),
      )

      expect(error?.code).toBe(RAISED_BY_TRIGGER)
      expect(error?.message).toContain('POST_IMAGES_LIMIT_EXCEEDED')

      const after = await service.from('posts').select('status').eq('id', postId).single()
      expect(after.data?.status).toBe('hidden')
      const images = await service.from('post_images').select('id').eq('post_id', postId)
      expect(images.data).toEqual([])
    })

    it('タグ6個で上限超過(P0001)になり、関数全体がロールバックされる', async () => {
      const postId = crypto.randomUUID()
      await alice.client.from('posts').insert({
        id: postId,
        author_id: alice.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'hidden',
      })
      postIds.push(postId)

      const tagIds = await occasionTagIds(6)
      const { error } = await alice.client.rpc(
        'finalize_post',
        finalizeArgs(postId, { p_tag_ids: tagIds }),
      )

      expect(error?.code).toBe(RAISED_BY_TRIGGER)
      expect(error?.message).toContain('POST_TAGS_LIMIT_EXCEEDED')

      const after = await service.from('posts').select('status').eq('id', postId).single()
      expect(after.data?.status).toBe('hidden')
      const tags = await service.from('post_tags').select('tag_id').eq('post_id', postId)
      expect(tags.data).toEqual([])
    })

    it('status=suspended のユーザーは RLS(42501) で弾かれ、hidden な行はそのまま残る', async () => {
      const postId = crypto.randomUUID()
      await service.from('posts').insert({
        id: postId,
        author_id: suspendedUser.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'hidden',
      })
      postIds.push(postId)

      const { error } = await suspendedUser.client.rpc('finalize_post', finalizeArgs(postId))

      expect(error?.code).toBe(RLS_VIOLATION)
      const after = await service.from('posts').select('status').eq('id', postId).single()
      expect(after.data?.status).toBe('hidden')
    })

    // D17 で見つかった行き詰まりの再発防止テスト: 同じ postId への同時 finalize は
    // 冒頭の SELECT ... FOR UPDATE により直列化され、後着は「対象が見つからない」
    // FORBIDDEN になるだけで、双方が中途半端な行を残すことはない
    it('同じ postId への同時 finalize は片方だけ成功し、もう片方は FORBIDDEN になる（画像・タグが重複登録されない）', async () => {
      const postId = crypto.randomUUID()
      await alice.client.from('posts').insert({
        id: postId,
        author_id: alice.userId,
        post_type: 'short',
        body_json: bodyJson,
        status: 'hidden',
      })
      postIds.push(postId)

      const [tagId] = await occasionTagIds(1)
      const path = `${alice.userId}/${postId}/a.webp`
      const args = finalizeArgs(postId, { p_image_paths: [path], p_tag_ids: [tagId as string] })

      const [first, second] = await Promise.all([
        alice.client.rpc('finalize_post', args),
        alice.client.rpc('finalize_post', args),
      ])

      const results = [first, second]
      const succeeded = results.filter((r) => r.error === null)
      const failed = results.filter((r) => r.error !== null)

      expect(succeeded).toHaveLength(1)
      expect(failed).toHaveLength(1)
      expect(failed[0]?.error?.message).toContain('FORBIDDEN')

      const after = await service.from('posts').select('status').eq('id', postId).single()
      expect(after.data?.status).toBe('published')

      const images = await service.from('post_images').select('storage_path').eq('post_id', postId)
      expect(images.data).toEqual([{ storage_path: path }])

      const tags = await service.from('post_tags').select('tag_id').eq('post_id', postId)
      expect(tags.data).toEqual([{ tag_id: tagId }])
    })
  })

  it('同じ storage_path を post_images に2回 insert すると一意制約違反(23505)になる（二重送信対策の前提）', async () => {
    const postId = crypto.randomUUID()
    await alice.client
      .from('posts')
      .insert({ id: postId, author_id: alice.userId, body_json: bodyJson, status: 'hidden' })
    postIds.push(postId)

    const path = `${alice.userId}/${postId}/dup.webp`
    const first = await alice.client
      .from('post_images')
      .insert({ post_id: postId, storage_path: path })
    expect(first.error).toBeNull()

    const second = await alice.client
      .from('post_images')
      .insert({ post_id: postId, storage_path: path })

    expect(second.error?.code).toBe('23505')
  })
})
