import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'

const anon = anonClient()
const service = serviceRoleClient()

const bodyJson = { type: 'doc', content: [{ type: 'paragraph', content: [] }] }

let alice: AuthedUser
let bob: AuthedUser
let suspendedUser: AuthedUser
let ownerOfCafe: AuthedUser
let cafeId: string
let otherCafeId: string

const postIds: string[] = []

async function insertPost(authorId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from('posts')
    .insert({
      author_id: authorId,
      body_json: bodyJson,
      ...overrides,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 posts の作成に失敗: ${error?.message}`)
  postIds.push(data.id)
  return data.id as string
}

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_posts' })
  bob = await createAuthedProfile({ username: 'bob_posts' })
  suspendedUser = await createAuthedProfile({ username: 'suspended_posts', status: 'suspended' })
  ownerOfCafe = await createAuthedProfile({ username: 'owner_posts' })

  const cafe = await service
    .from('cafes')
    .insert({
      name: '投稿テスト用カフェ',
      prefecture: '東京都',
      city: '渋谷区',
      verified_owner_id: ownerOfCafe.userId,
    })
    .select('id')
    .single()
  if (cafe.error || !cafe.data)
    throw new Error(`テスト用 cafes の作成に失敗: ${cafe.error?.message}`)
  cafeId = cafe.data.id as string

  const otherCafe = await service
    .from('cafes')
    .insert({
      name: '他のカフェ',
      prefecture: '東京都',
      city: '渋谷区',
      verified_owner_id: bob.userId,
    })
    .select('id')
    .single()
  if (otherCafe.error || !otherCafe.data) {
    throw new Error(`テスト用 cafes(2) の作成に失敗: ${otherCafe.error?.message}`)
  }
  otherCafeId = otherCafe.data.id as string
})

afterEach(async () => {
  if (postIds.length > 0) {
    await service.from('posts').delete().in('id', postIds)
    postIds.length = 0
  }
  await service.from('blocks').delete().eq('blocker_id', alice.userId)
  await service.from('blocks').delete().eq('blocker_id', bob.userId)
  await service.from('follows').delete().eq('follower_id', alice.userId)
  await service.from('follows').delete().eq('follower_id', bob.userId)
})

afterAll(async () => {
  await service.from('cafes').delete().in('id', [cafeId, otherCafeId])
  await alice?.cleanup()
  await bob?.cleanup()
  await suspendedUser?.cleanup()
  await ownerOfCafe?.cleanup()
})

describe('posts の body_text / body_search 生成列', () => {
  it('Tiptap JSON からプレーンテキストを抽出する', async () => {
    const id = await insertPost(alice.userId, {
      body_json: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '渋谷の隠れ家カフェ' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Wi-Fi完備' }] },
        ],
      },
    })

    const { data } = await service.from('posts').select('body_text').eq('id', id).single()
    expect(data?.body_text).toBe('渋谷の隠れ家カフェ Wi-Fi完備')
  })

  it('body_text の重複（配列展開の二重取得）が起きない', async () => {
    const id = await insertPost(alice.userId, {
      body_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
      },
    })

    const { data } = await service.from('posts').select('body_text').eq('id', id).single()
    expect(data?.body_text).toBe('A')
  })
})

describe('posts の SELECT', () => {
  it('未ログインでも public な published 投稿を読める', async () => {
    const id = await insertPost(alice.userId, { visibility: 'public' })

    const { data, error } = await anon.from('posts').select('id').eq('id', id)

    expect(error).toBeNull()
    expect(data).toEqual([{ id }])
  })

  it('archived 投稿は誰からも見えない', async () => {
    const id = await insertPost(alice.userId, { status: 'archived' })

    const { data } = await bob.client.from('posts').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('visibility=followers は未ログインから見えない', async () => {
    const id = await insertPost(alice.userId, { visibility: 'followers' })

    const { data } = await anon.from('posts').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('visibility=followers は作者本人からは見える', async () => {
    const id = await insertPost(alice.userId, { visibility: 'followers' })

    const { data } = await alice.client.from('posts').select('id').eq('id', id)
    expect(data).toEqual([{ id }])
  })

  it('visibility=followers はフォロワーから見える', async () => {
    const id = await insertPost(alice.userId, { visibility: 'followers' })
    await service.from('follows').insert({ follower_id: bob.userId, followee_id: alice.userId })

    const { data } = await bob.client.from('posts').select('id').eq('id', id)
    expect(data).toEqual([{ id }])
  })

  it('visibility=followers はフォロワーでない第三者からは見えない', async () => {
    const id = await insertPost(alice.userId, { visibility: 'followers' })

    const { data } = await bob.client.from('posts').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('ブロックした相手の投稿は見えない', async () => {
    const id = await insertPost(bob.userId, { visibility: 'public' })
    await service.from('blocks').insert({ blocker_id: alice.userId, blocked_id: bob.userId })

    const { data } = await alice.client.from('posts').select('id').eq('id', id)
    expect(data).toEqual([])
  })

  it('相手にブロックされている場合も投稿は見えない（双方向）', async () => {
    const id = await insertPost(bob.userId, { visibility: 'public' })
    await service.from('blocks').insert({ blocker_id: bob.userId, blocked_id: alice.userId })

    const { data } = await alice.client.from('posts').select('id').eq('id', id)
    expect(data).toEqual([])
  })
})

describe('posts の INSERT', () => {
  it('認証済みユーザーは自分を author_id として投稿できる', async () => {
    const { data, error } = await alice.client
      .from('posts')
      .insert({ author_id: alice.userId, body_json: bodyJson })
      .select('id')
      .single()

    expect(error).toBeNull()
    if (data) postIds.push(data.id)
  })

  it('未ログインは投稿できない', async () => {
    const { error } = await anon
      .from('posts')
      .insert({ author_id: alice.userId, body_json: bodyJson })
    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('他人を author_id に仕立てて投稿できない', async () => {
    const { error } = await alice.client
      .from('posts')
      .insert({ author_id: bob.userId, body_json: bodyJson })
    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('status=suspended のユーザーは投稿できない', async () => {
    const { error } = await suspendedUser.client
      .from('posts')
      .insert({ author_id: suspendedUser.userId, body_json: bodyJson })
    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('post_type / visibility / status に不正な値は登録できない', async () => {
    const { error } = await service
      .from('posts')
      .insert({ author_id: alice.userId, body_json: bodyJson, post_type: 'video' })
    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  // is_official=true かつ cafe_id 未指定は CHECK 制約でも弾ける組み合わせだが、
  // guard_posts_official_owner トリガー（BEFORE INSERT）が CHECK より先に走り、
  // cafe_id=null では EXISTS が常に偽になるため実際にはトリガーが先に FORBIDDEN を返す
  it('is_official=true は cafe_id 未指定だと登録できない（トリガーが先に弾く）', async () => {
    const { error } = await service
      .from('posts')
      .insert({ author_id: ownerOfCafe.userId, body_json: bodyJson, is_official: true })
    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('認証済みオーナー本人は is_official=true で投稿できる', async () => {
    const { data, error } = await ownerOfCafe.client
      .from('posts')
      .insert({
        author_id: ownerOfCafe.userId,
        cafe_id: cafeId,
        body_json: bodyJson,
        is_official: true,
        official_format: 'tip',
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    if (data) postIds.push(data.id)
  })

  // トリガーと RLS の両方が同じ条件を守るため、authenticated 経由ではトリガーが
  // BEFORE INSERT で先に FORBIDDEN を返す（RLS の WITH CHECK まで到達しない）。
  // RLS 側の同条件は service_role 経由の書き込み（トリガーのみが働く）から
  // 独立して効いていることを別テストで確認する
  it('認証済みオーナーでない場合は is_official=true で投稿できない', async () => {
    const { error } = await alice.client.from('posts').insert({
      author_id: alice.userId,
      cafe_id: cafeId,
      body_json: bodyJson,
      is_official: true,
    })
    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('自分のカフェではない cafe_id で is_official=true を送っても登録できない', async () => {
    const { error } = await ownerOfCafe.client.from('posts').insert({
      author_id: ownerOfCafe.userId,
      cafe_id: otherCafeId,
      body_json: bodyJson,
      is_official: true,
    })
    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('service_role 経由でも認証済みオーナー以外の is_official=true 投稿はトリガーで弾かれる', async () => {
    const { error } = await service.from('posts').insert({
      author_id: alice.userId,
      cafe_id: cafeId,
      body_json: bodyJson,
      is_official: true,
    })
    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })
})

describe('posts の UPDATE', () => {
  it('作者本人は更新できる', async () => {
    const id = await insertPost(alice.userId)

    const { data, error } = await alice.client
      .from('posts')
      .update({ title: '更新後タイトル' })
      .eq('id', id)
      .select('title')

    expect(error).toBeNull()
    expect(data).toEqual([{ title: '更新後タイトル' }])
  })

  it('作者以外は更新できない（対象0件）', async () => {
    const id = await insertPost(alice.userId)

    const { data, error } = await bob.client
      .from('posts')
      .update({ title: '乗っ取り' })
      .eq('id', id)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('status=suspended になった作者は自分の投稿を更新できない', async () => {
    const suspended = await createAuthedProfile({ username: 'suspend_after_posts' })
    try {
      const id = await insertPost(suspended.userId)
      await service.from('profiles').update({ status: 'suspended' }).eq('id', suspended.userId)

      // USING 句（author_id一致）は通り対象行が選ばれるが、WITH CHECK の
      // is_active_user() で弾かれるため「対象0件」ではなく明示的な RLS エラーになる
      const { error } = await suspended.client
        .from('posts')
        .update({ title: '停止後の更新' })
        .eq('id', id)
        .select()

      expect(error?.code).toBe(RLS_VIOLATION)
    } finally {
      await suspended.cleanup()
    }
  })

  it('is_official を後から true に付け替えるのも認証済みオーナー以外は弾かれる', async () => {
    const id = await insertPost(alice.userId, { cafe_id: cafeId })

    const { error } = await alice.client.from('posts').update({ is_official: true }).eq('id', id)

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('updated_at はトリガーで自動更新される', async () => {
    const id = await insertPost(alice.userId)
    const before = await service.from('posts').select('updated_at').eq('id', id).single()

    await new Promise((resolve) => setTimeout(resolve, 10))
    await alice.client.from('posts').update({ title: '更新' }).eq('id', id)

    const after = await service.from('posts').select('updated_at').eq('id', id).single()
    expect(new Date(after.data?.updated_at as string).getTime()).toBeGreaterThan(
      new Date(before.data?.updated_at as string).getTime(),
    )
  })
})

describe('posts の DELETE', () => {
  it('作者本人は削除できる（論理削除運用だが物理DELETEも作者に許可）', async () => {
    const id = await insertPost(alice.userId)

    const { data, error } = await alice.client.from('posts').delete().eq('id', id).select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    postIds.length = 0
  })

  it('作者以外は削除できない（対象0件）', async () => {
    const id = await insertPost(alice.userId)

    const { data, error } = await bob.client.from('posts').delete().eq('id', id).select()

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('post_images', () => {
  it('作者は自分の投稿に画像を追加できる', async () => {
    const id = await insertPost(alice.userId)

    const { error } = await alice.client
      .from('post_images')
      .insert({ post_id: id, storage_path: `post-images/${alice.userId}/${id}/a.webp` })

    expect(error).toBeNull()
  })

  it('作者以外は画像を追加できない', async () => {
    const id = await insertPost(alice.userId)

    const { error } = await bob.client
      .from('post_images')
      .insert({ post_id: id, storage_path: `post-images/${bob.userId}/${id}/a.webp` })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('画像は誰でも読める', async () => {
    const id = await insertPost(alice.userId)
    await service
      .from('post_images')
      .insert({ post_id: id, storage_path: `post-images/${alice.userId}/${id}/a.webp` })

    const { data, error } = await anon.from('post_images').select('id').eq('post_id', id)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('11枚目は追加できない（上限10枚）', async () => {
    const id = await insertPost(alice.userId)
    const rows = Array.from({ length: 10 }, (_, i) => ({
      post_id: id,
      storage_path: `post-images/${alice.userId}/${id}/${i}.webp`,
    }))
    const filled = await service.from('post_images').insert(rows)
    expect(filled.error).toBeNull()

    const { error } = await alice.client
      .from('post_images')
      .insert({ post_id: id, storage_path: `post-images/${alice.userId}/${id}/eleventh.webp` })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('POST_IMAGES_LIMIT_EXCEEDED')
  })

  it('作者は自分の投稿の画像を削除できる', async () => {
    const id = await insertPost(alice.userId)
    const inserted = await service
      .from('post_images')
      .insert({ post_id: id, storage_path: `post-images/${alice.userId}/${id}/a.webp` })
      .select('id')
      .single()

    const { data, error } = await alice.client
      .from('post_images')
      .delete()
      .eq('id', inserted.data?.id)
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('投稿を削除すると画像も連鎖削除される', async () => {
    const id = await insertPost(alice.userId)
    await service
      .from('post_images')
      .insert({ post_id: id, storage_path: `post-images/${alice.userId}/${id}/a.webp` })

    await service.from('posts').delete().eq('id', id)
    postIds.length = 0

    const { data } = await service.from('post_images').select('id').eq('post_id', id)
    expect(data).toEqual([])
  })
})

describe('post_tags', () => {
  // 'area' はタグではなく areas マスタが正なので tags には存在しない。
  // 'other' カテゴリは5個しか無いため、上限5個+1個の6個を必要とするテストのために
  // 'occasion'（15個）の先頭6件と合わせて occasionTagIds という名前のまま流用する
  let occasionTagIds: string[] = []

  beforeAll(async () => {
    const tags = await service
      .from('tags')
      .select('id')
      .eq('category', 'occasion')
      .order('slug')
      .limit(6)
    occasionTagIds = (tags.data ?? []).map((t) => t.id as string)
  })

  it('作者は自分の投稿にタグを付けられる', async () => {
    const id = await insertPost(alice.userId)

    const { error } = await alice.client
      .from('post_tags')
      .insert({ post_id: id, tag_id: occasionTagIds[0] })

    expect(error).toBeNull()
  })

  it('作者以外はタグを付けられない', async () => {
    const id = await insertPost(alice.userId)

    const { error } = await bob.client
      .from('post_tags')
      .insert({ post_id: id, tag_id: occasionTagIds[0] })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('同じタグを2回付けられない', async () => {
    const id = await insertPost(alice.userId)
    await service.from('post_tags').insert({ post_id: id, tag_id: occasionTagIds[0] })

    const { error } = await alice.client
      .from('post_tags')
      .insert({ post_id: id, tag_id: occasionTagIds[0] })

    expect(error?.code).toBe(UNIQUE_VIOLATION)
  })

  it('6個目のタグは付けられない（上限5個）', async () => {
    const id = await insertPost(alice.userId)
    const rows = occasionTagIds.slice(0, 5).map((tag_id) => ({ post_id: id, tag_id }))
    const filled = await service.from('post_tags').insert(rows)
    expect(filled.error).toBeNull()

    const { error } = await alice.client
      .from('post_tags')
      .insert({ post_id: id, tag_id: occasionTagIds[5] })

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('POST_TAGS_LIMIT_EXCEEDED')
  })

  it('作者は自分の投稿のタグを外せる', async () => {
    const id = await insertPost(alice.userId)
    await service.from('post_tags').insert({ post_id: id, tag_id: occasionTagIds[0] })

    const { data, error } = await alice.client
      .from('post_tags')
      .delete()
      .eq('post_id', id)
      .eq('tag_id', occasionTagIds[0])
      .select()

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

describe('drafts の RLS', () => {
  afterEach(async () => {
    await service.from('drafts').delete().eq('author_id', alice.userId)
    await service.from('drafts').delete().eq('author_id', bob.userId)
  })

  it('自分の下書きを作成・取得できる', async () => {
    const { error } = await alice.client.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: 'device-1',
      payload: {
        v: 1,
        post_type: 'blog',
        title: null,
        body_json: bodyJson,
        tag_ids: [],
        image_paths: [],
        cafe_id: null,
      },
    })
    expect(error).toBeNull()

    const { data } = await alice.client.from('drafts').select('client_draft_key')
    expect(data).toEqual([{ client_draft_key: 'device-1' }])
  })

  it('他人の下書きは読めない', async () => {
    await service.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: 'device-1',
      payload: { v: 1 },
    })

    const { data } = await bob.client.from('drafts').select('id')
    expect(data).toEqual([])
  })

  it('他人を author_id に仕立てて作成できない', async () => {
    const { error } = await alice.client.from('drafts').insert({
      author_id: bob.userId,
      client_draft_key: 'device-1',
      payload: { v: 1 },
    })
    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('同じ端末キーで2件目は作れない（UNIQUE）', async () => {
    await service.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: 'device-1',
      payload: { v: 1 },
    })

    const { error } = await alice.client.from('drafts').insert({
      author_id: alice.userId,
      client_draft_key: 'device-1',
      payload: { v: 1 },
    })
    expect(error?.code).toBe(UNIQUE_VIOLATION)
  })

  it('自分の下書きを更新・削除できる', async () => {
    const inserted = await service
      .from('drafts')
      .insert({ author_id: alice.userId, client_draft_key: 'device-1', payload: { v: 1 } })
      .select('id')
      .single()

    const updated = await alice.client
      .from('drafts')
      .update({ payload: { v: 2 } })
      .eq('id', inserted.data?.id)
      .select('payload')
    expect(updated.error).toBeNull()
    expect(updated.data).toEqual([{ payload: { v: 2 } }])

    const deleted = await alice.client.from('drafts').delete().eq('id', inserted.data?.id).select()
    expect(deleted.error).toBeNull()
    expect(deleted.data).toHaveLength(1)
  })
})
