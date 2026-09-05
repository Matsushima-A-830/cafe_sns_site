import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  createAuthedUser,
  serviceRoleClient,
} from '../helpers/supabase'

// RLS 違反の INSERT で PostgREST が返す SQLSTATE
const RLS_VIOLATION = '42501'

const anon = anonClient()
const service = serviceRoleClient()

let authed: AuthedUser

beforeAll(async () => {
  authed = await createAuthedUser()
})

afterAll(async () => {
  await authed?.cleanup()
  // 拒否されるはずの INSERT が万一通った場合、痕跡を残すと後続ファイルの
  // 件数テストが無関係な場所で落ちる（fileParallelism: false のため）
  await service.from('areas').delete().in('code', ['JP-13-anon-injected', 'JP-13-user-injected'])
  await service.from('tags').delete().eq('slug', 'user-made-tag')
  await service.from('badges').delete().eq('code', 'SELF_AWARDED')
})

describe('areas の RLS', () => {
  const inactiveCode = 'JP-13-rls-test-inactive'

  beforeAll(async () => {
    const { error } = await service.from('areas').insert({
      code: inactiveCode,
      prefecture_code: 'JP-13',
      slug: 'rls-test-inactive',
      label: 'RLSテスト用（無効）',
      level: 'sub_area',
      is_active: false,
    })
    expect(error).toBeNull()
  })

  afterAll(async () => {
    await service.from('areas').delete().eq('code', inactiveCode)
  })

  it('未ログインでも有効なエリアを読める', async () => {
    const { data, error } = await anon
      .from('areas')
      .select('code, label')
      .eq('code', 'JP-13-shibuya-ku')

    expect(error).toBeNull()
    expect(data).toEqual([{ code: 'JP-13-shibuya-ku', label: '渋谷区' }])
  })

  it('is_active = false のエリアは読めない', async () => {
    const { data, error } = await anon.from('areas').select('code').eq('code', inactiveCode)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('未ログインは INSERT できない', async () => {
    const { error } = await anon.from('areas').insert({
      code: 'JP-13-anon-injected',
      prefecture_code: 'JP-13',
      slug: 'anon-injected',
      label: '侵入',
      level: 'sub_area',
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('ログイン済みでも INSERT できない', async () => {
    const { error } = await authed.client.from('areas').insert({
      code: 'JP-13-user-injected',
      prefecture_code: 'JP-13',
      slug: 'user-injected',
      label: '侵入',
      level: 'sub_area',
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  // UPDATE / DELETE はポリシー不在なので「エラー」ではなく「0件」になる
  it('ログイン済みでも UPDATE できない（対象0件のまま）', async () => {
    const { data, error } = await authed.client
      .from('areas')
      .update({ label: '書き換え' })
      .eq('code', 'JP-13-shibuya-ku')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await service
      .from('areas')
      .select('label')
      .eq('code', 'JP-13-shibuya-ku')
      .single()
    expect(after.data?.label).toBe('渋谷区')
  })

  it('ログイン済みでも DELETE できない（行が残る）', async () => {
    const { data, error } = await authed.client
      .from('areas')
      .delete()
      .eq('code', 'JP-13-shibuya-ku')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await service.from('areas').select('code').eq('code', 'JP-13-shibuya-ku')
    expect(after.data).toHaveLength(1)
  })
})

describe('tags の RLS', () => {
  it('未ログインでもタグを読める', async () => {
    const { data, error } = await anon.from('tags').select('slug, label').eq('slug', 'solo-time')

    expect(error).toBeNull()
    expect(data).toEqual([{ slug: 'solo-time', label: 'ひとり時間' }])
  })

  it('ログイン済みでも INSERT できない', async () => {
    const { error } = await authed.client
      .from('tags')
      .insert({ slug: 'user-made-tag', label: '勝手なタグ', category: 'mood' })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('ログイン済みでも UPDATE できない（対象0件のまま）', async () => {
    const { data, error } = await authed.client
      .from('tags')
      .update({ priority: 999 })
      .eq('slug', 'solo-time')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await service.from('tags').select('priority').eq('slug', 'solo-time').single()
    expect(after.data?.priority).toBe(100)
  })
})

describe('badges の RLS', () => {
  it('未ログインでもバッジを読める', async () => {
    const { data, error } = await anon.from('badges').select('code, name').eq('code', 'POST_FIRST')

    expect(error).toBeNull()
    expect(data).toEqual([{ code: 'POST_FIRST', name: 'はじめての一杯' }])
  })

  it('ログイン済みでも INSERT できない', async () => {
    const { error } = await authed.client.from('badges').insert({
      code: 'SELF_AWARDED',
      name: '自称バッジ',
      criteria: { type: 'post_count', threshold: 0 },
    })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('ログイン済みでも DELETE できない（行が残る）', async () => {
    const { data, error } = await authed.client
      .from('badges')
      .delete()
      .eq('code', 'POST_FIRST')
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await service.from('badges').select('code').eq('code', 'POST_FIRST')
    expect(after.data).toHaveLength(1)
  })
})

// A9（最初の admin）の決着で is_admin() が入り、ようやく許可パスを検証できるようになった
describe('マスタ3テーブルへの admin の書き込み', () => {
  let admin: AuthedUser

  beforeAll(async () => {
    admin = await createAuthedProfile({ username: 'admin_master', role: 'admin' })
  })

  afterAll(async () => {
    await service.from('areas').delete().eq('code', 'JP-13-admin-added')
    await service.from('tags').delete().eq('slug', 'admin-added-tag')
    await service.from('tags').delete().eq('slug', 'demoted-tag')
    await admin?.cleanup()
  })

  it('admin はエリアを追加できる', async () => {
    const { error } = await admin.client.from('areas').insert({
      code: 'JP-13-admin-added',
      prefecture_code: 'JP-13',
      slug: 'admin-added',
      label: 'admin が足したエリア',
      level: 'sub_area',
      parent_code: 'JP-13-shibuya-ku',
    })

    expect(error).toBeNull()
  })

  it('admin はタグを追加・更新できる', async () => {
    const created = await admin.client
      .from('tags')
      .insert({ slug: 'admin-added-tag', label: 'admin タグ', category: 'mood' })
    expect(created.error).toBeNull()

    const { data, error } = await admin.client
      .from('tags')
      .update({ is_curated: true })
      .eq('slug', 'admin-added-tag')
      .select('is_curated')
    expect(error).toBeNull()
    expect(data).toEqual([{ is_curated: true }])
  })

  it('role を admin から落とすと書けなくなる', async () => {
    await service.from('profiles').update({ role: 'user' }).eq('id', admin.userId)
    try {
      const { error } = await admin.client
        .from('tags')
        .insert({ slug: 'demoted-tag', label: '降格後', category: 'mood' })

      expect(error?.code).toBe(RLS_VIOLATION)
    } finally {
      await service.from('profiles').update({ role: 'admin' }).eq('id', admin.userId)
    }
  })
})
