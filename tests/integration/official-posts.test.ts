import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

/**
 * 公式投稿（S_POST_OFFICIAL, 幹C-2）の finalize RPC と通知 fan-out を実 DB に対して動かす。
 * 引き継ぎドキュメントが名指しした最大の懸念（notify_on_official_post が静かに
 * 呼ばれないまま緑になるケース）を潰すため、favorite/want_to_go ユーザーに実際に
 * 通知が届くかをここで明示的に確認する
 *   supabase/migrations/20260921211943_official_posts_finalize.sql
 */

const service = serviceRoleClient()

let owner: AuthedUser
let favUser: AuthedUser
let wantUser: AuthedUser
let bothUser: AuthedUser
let blockedUser: AuthedUser
let unrelatedUser: AuthedUser
let cafeId: string

const postIds: string[] = []

async function notificationsFor(recipientId: string, entityId: string) {
  const { data, error } = await service
    .from('notifications')
    .select('id, recipient_id, actor_id, type, entity_type, entity_id')
    .eq('recipient_id', recipientId)
    .eq('type', 'official_post')
    .eq('entity_id', entityId)
  if (error) throw new Error(`notifications の取得に失敗: ${error.message}`)
  return data ?? []
}

beforeAll(async () => {
  owner = await createAuthedProfile({ username: 'official_owner', role: 'owner' })
  favUser = await createAuthedProfile({ username: 'official_fav' })
  wantUser = await createAuthedProfile({ username: 'official_want' })
  bothUser = await createAuthedProfile({ username: 'official_both' })
  blockedUser = await createAuthedProfile({ username: 'official_blocked' })
  unrelatedUser = await createAuthedProfile({ username: 'official_unrelated' })

  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({ name: '統合テストカフェ', prefecture: '東京都', city: '渋谷区', status: 'active' })
    .select('id')
    .single()
  if (cafeError || !cafe) throw new Error(`テスト用カフェの作成に失敗: ${cafeError?.message}`)
  cafeId = cafe.id
  const { error: claimError } = await service
    .from('cafes')
    .update({ verified_owner_id: owner.userId })
    .eq('id', cafeId)
  if (claimError) throw new Error(`verified_owner_id の設定に失敗: ${claimError.message}`)

  await service.from('user_cafe_lists').insert([
    { user_id: favUser.userId, cafe_id: cafeId, list_type: 'favorite' },
    { user_id: wantUser.userId, cafe_id: cafeId, list_type: 'want_to_go' },
    { user_id: bothUser.userId, cafe_id: cafeId, list_type: 'favorite' },
    { user_id: bothUser.userId, cafe_id: cafeId, list_type: 'want_to_go' },
    { user_id: blockedUser.userId, cafe_id: cafeId, list_type: 'favorite' },
  ])
  await service.from('blocks').insert({ blocker_id: blockedUser.userId, blocked_id: owner.userId })
})

afterAll(async () => {
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  await service.from('cafes').delete().eq('id', cafeId)
  await owner?.cleanup()
  await favUser?.cleanup()
  await wantUser?.cleanup()
  await bothUser?.cleanup()
  await blockedUser?.cleanup()
  await unrelatedUser?.cleanup()
})

async function reserveOfficial(officialFormat: string) {
  const { data, error } = await owner.client
    .from('posts')
    .insert({
      author_id: owner.userId,
      cafe_id: cafeId,
      post_type: officialFormat === 'tip' ? 'blog' : 'short',
      official_format: officialFormat,
      is_official: true,
      body_json: { type: 'doc', content: [] },
      status: 'hidden',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`予約行の作成に失敗: ${error?.message}`)
  postIds.push(data.id)
  return data.id as string
}

describe('finalize_official_post', () => {
  it('公開確定すると status が published になり、metadata が保存される', async () => {
    const postId = await reserveOfficial('closure')

    const { error } = await owner.client.rpc('finalize_official_post', {
      p_post_id: postId,
      p_official_format: 'closure',
      p_title: null,
      p_body_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '私用のため休業' }] }],
      },
      p_metadata: {
        v: 1,
        closure_type: 'closed',
        starts_on: '2026-09-22',
        ends_on: '2026-09-23',
        reason: '私用のため休業',
      },
      p_image_paths: [],
    })
    expect(error).toBeNull()

    const { data } = await service
      .from('posts')
      .select('status, metadata')
      .eq('id', postId)
      .single()
    expect(data?.status).toBe('published')
    expect(data?.metadata).toMatchObject({ closure_type: 'closed' })
  })

  it('既に公開済みの投稿への再送は FORBIDDEN になる（行ロックによる直列化と同じ設計）', async () => {
    const postId = await reserveOfficial('tip')
    await owner.client.rpc('finalize_official_post', {
      p_post_id: postId,
      p_official_format: 'tip',
      p_title: 'タイトル',
      p_body_json: { type: 'doc', content: [] },
      p_metadata: { v: 1 },
      p_image_paths: [],
    })

    const { error } = await owner.client.rpc('finalize_official_post', {
      p_post_id: postId,
      p_official_format: 'tip',
      p_title: 'タイトル2',
      p_body_json: { type: 'doc', content: [] },
      p_metadata: { v: 1 },
      p_image_paths: [],
    })
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('予約時と異なる official_format を送ると FORBIDDEN になる（closureで予約したpostIdにtipを送る不整合を防ぐ）', async () => {
    const postId = await reserveOfficial('closure')

    const { error } = await owner.client.rpc('finalize_official_post', {
      p_post_id: postId,
      p_official_format: 'tip',
      p_title: 'なりすましタイトル',
      p_body_json: { type: 'doc', content: [] },
      p_metadata: { v: 1 },
      p_image_paths: [],
    })
    expect(error?.message).toContain('FORBIDDEN')

    // 対象0件で何も変更されず、予約時のまま hidden に留まる
    const { data } = await service.from('posts').select('status, title').eq('id', postId).single()
    expect(data?.status).toBe('hidden')
    expect(data?.title).toBeNull()
  })
})

describe('notify_on_official_post', () => {
  it('favorite/want_to_go ユーザーに通知が届き、両方に入れているユーザーへは重複送信しない', async () => {
    const postId = await reserveOfficial('today_special')
    const { error } = await owner.client.rpc('finalize_official_post', {
      p_post_id: postId,
      p_official_format: 'today_special',
      p_title: null,
      p_body_json: { type: 'doc', content: [] },
      p_metadata: { v: 1, menu_name: 'マロンタルト', price_yen: 580, valid_until: null },
      p_image_paths: [],
    })
    expect(error).toBeNull()

    expect(await notificationsFor(favUser.userId, postId)).toHaveLength(1)
    expect(await notificationsFor(wantUser.userId, postId)).toHaveLength(1)
    expect(await notificationsFor(bothUser.userId, postId)).toHaveLength(1)
    expect(await notificationsFor(unrelatedUser.userId, postId)).toHaveLength(0)
    expect(await notificationsFor(owner.userId, postId)).toHaveLength(0)

    const [row] = await notificationsFor(favUser.userId, postId)
    expect(row?.actor_id).toBe(owner.userId)
    expect(row?.entity_type).toBe('post')
  })

  it('オーナーをブロックしているユーザーには通知が作られない', async () => {
    const postId = await reserveOfficial('new_menu')
    await owner.client.rpc('finalize_official_post', {
      p_post_id: postId,
      p_official_format: 'new_menu',
      p_title: null,
      p_body_json: { type: 'doc', content: [] },
      p_metadata: { v: 1, menu_name: '秋ブレンド', price_yen: 620, available_from: '2026-09-22' },
      p_image_paths: [],
    })

    expect(await notificationsFor(blockedUser.userId, postId)).toHaveLength(0)
  })
})

// get_owned_cafe（20260921235044）: cafes の SELECT RLS（status='active' のみ）を
// バイパスして本人のカフェを返せるか。closed/hidden のときこそ「臨時休業」を
// 告知したい場面のため、ここが素朴な select のままだと S_POST_OFFICIAL が
// 本末転倒に機能しなくなる（/code-review 指摘、lib/owner/dashboard.ts getOwnedCafe）
describe('get_owned_cafe', () => {
  it('status=active のカフェは本人から見える', async () => {
    const { data, error } = await owner.client.rpc('get_owned_cafe')
    expect(error).toBeNull()
    expect(data).toEqual([{ id: cafeId, name: '統合テストカフェ' }])
  })

  it('status=closed/hidden でも本人からは見える（cafes_select_active_authenticated だけでは0件になる）', async () => {
    const closedOwner = await createAuthedProfile({ username: 'official_closed_owner' })
    try {
      const { data: closedCafe, error: cafeError } = await service
        .from('cafes')
        .insert({
          name: '休業中テストカフェ',
          prefecture: '東京都',
          city: '渋谷区',
          status: 'closed',
        })
        .select('id')
        .single()
      if (cafeError || !closedCafe)
        throw new Error(`テスト用カフェの作成に失敗: ${cafeError?.message}`)
      await service
        .from('cafes')
        .update({ verified_owner_id: closedOwner.userId })
        .eq('id', closedCafe.id)

      // 素朴な select だと status='active' 条件に弾かれて0件になることの確認
      const plainSelect = await closedOwner.client
        .from('cafes')
        .select('id')
        .eq('verified_owner_id', closedOwner.userId)
      expect(plainSelect.data ?? []).toHaveLength(0)

      // get_owned_cafe は security definer で同じ状況でも返す
      const { data, error } = await closedOwner.client.rpc('get_owned_cafe')
      expect(error).toBeNull()
      expect(data).toEqual([{ id: closedCafe.id, name: '休業中テストカフェ' }])

      await service.from('cafes').delete().eq('id', closedCafe.id)
    } finally {
      await closedOwner.cleanup()
    }
  })

  it('カフェを持たないユーザーには0件を返す', async () => {
    const { data, error } = await unrelatedUser.client.rpc('get_owned_cafe')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })
})
