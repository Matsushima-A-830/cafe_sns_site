import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  createAuthedUser,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const RAISED_BY_TRIGGER = 'P0001'

const anon = anonClient()
const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_rls', display_name: 'アリス' })
  bob = await createAuthedProfile({ username: 'bob_rls', display_name: 'ボブ' })
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
})

describe('profiles の SELECT', () => {
  it('未ログインでも公開プロフィールを読める', async () => {
    const { data, error } = await anon
      .from('profiles')
      .select('username, display_name')
      .eq('id', alice.userId)

    expect(error).toBeNull()
    expect(data).toEqual([{ username: 'alice_rls', display_name: 'アリス' }])
  })
})

describe('profiles の INSERT', () => {
  it('自分の id でしか作れない', async () => {
    const stranger = await createAuthedUser()
    try {
      const { error } = await stranger.client.from('profiles').insert({
        id: crypto.randomUUID(),
        username: 'someone_else',
        display_name: '他人',
        birth_date: '2000-01-01',
      })

      expect(error?.code).toBe(RLS_VIOLATION)
    } finally {
      await stranger.cleanup()
    }
  })

  it('13歳未満は作れない（enforce_min_age）', async () => {
    const kid = await createAuthedUser()
    const tooYoung = new Date()
    tooYoung.setFullYear(tooYoung.getFullYear() - 12)
    try {
      const { error } = await kid.client.from('profiles').insert({
        id: kid.userId,
        username: 'too_young',
        display_name: '12歳',
        birth_date: tooYoung.toISOString().slice(0, 10),
      })

      expect(error?.code).toBe(RAISED_BY_TRIGGER)
      expect(error?.message).toContain('AGE_RESTRICTED')
    } finally {
      await kid.cleanup()
    }
  })

  it('ちょうど13歳は作れる', async () => {
    const kid = await createAuthedUser()
    const exactly13 = new Date()
    exactly13.setFullYear(exactly13.getFullYear() - 13)
    try {
      const { error } = await kid.client.from('profiles').insert({
        id: kid.userId,
        username: 'exactly_13',
        display_name: '13歳',
        birth_date: exactly13.toISOString().slice(0, 10),
      })

      expect(error).toBeNull()
    } finally {
      await kid.cleanup()
    }
  })
})

describe('profiles の UPDATE', () => {
  it('自分のプロフィールは更新できる', async () => {
    const { data, error } = await alice.client
      .from('profiles')
      .update({ display_name: 'アリス改' })
      .eq('id', alice.userId)
      .select('display_name')

    expect(error).toBeNull()
    expect(data).toEqual([{ display_name: 'アリス改' }])
  })

  it('他人のプロフィールは更新できない（対象0件）', async () => {
    const { data, error } = await alice.client
      .from('profiles')
      .update({ display_name: '乗っ取り' })
      .eq('id', bob.userId)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await service
      .from('profiles')
      .select('display_name')
      .eq('id', bob.userId)
      .single()
    expect(after.data?.display_name).toBe('ボブ')
  })

  it('自分の role は上げられない（admin 昇格の防止）', async () => {
    const { error } = await alice.client
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', alice.userId)

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')

    const after = await service.from('profiles').select('role').eq('id', alice.userId).single()
    expect(after.data?.role).toBe('user')
  })

  it('自分の status は変えられない（凍結の自己解除の防止）', async () => {
    const { error } = await alice.client
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', alice.userId)

    expect(error?.code).toBe(RAISED_BY_TRIGGER)
    expect(error?.message).toContain('FORBIDDEN')
  })

  it('updated_at はトリガーで自動更新される', async () => {
    const before = await service
      .from('profiles')
      .select('updated_at')
      .eq('id', alice.userId)
      .single()

    await alice.client.from('profiles').update({ bio: '更新テスト' }).eq('id', alice.userId)

    const after = await service
      .from('profiles')
      .select('updated_at')
      .eq('id', alice.userId)
      .single()
    expect(new Date(after.data?.updated_at).getTime()).toBeGreaterThan(
      new Date(before.data?.updated_at).getTime(),
    )
  })
})

describe('profiles の DELETE', () => {
  it("本人でも削除できない（status='deleted' で無効化する運用）", async () => {
    const { data, error } = await alice.client
      .from('profiles')
      .delete()
      .eq('id', alice.userId)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await service.from('profiles').select('id').eq('id', alice.userId)
    expect(after.data).toHaveLength(1)
  })
})

describe('admin の権限', () => {
  // A9 の本番手順「最初の1人を service_role で手動昇格する」が通ること。
  // guard トリガーが service_role まで巻き込むと、本番に admin を作る手段が消える
  it('service_role は role を昇格できる（本番の初回昇格の経路）', async () => {
    const { error } = await service.from('profiles').update({ role: 'admin' }).eq('id', bob.userId)
    expect(error).toBeNull()

    const after = await service.from('profiles').select('role').eq('id', bob.userId).single()
    expect(after.data?.role).toBe('admin')

    await service.from('profiles').update({ role: 'user' }).eq('id', bob.userId)
  })

  it('admin は他人の role と status を変えられる', async () => {
    const admin = await createAuthedProfile({ username: 'admin_rls', role: 'admin' })
    try {
      const { error } = await admin.client
        .from('profiles')
        .update({ role: 'owner', status: 'suspended' })
        .eq('id', bob.userId)

      expect(error).toBeNull()

      const after = await service
        .from('profiles')
        .select('role, status')
        .eq('id', bob.userId)
        .single()
      expect(after.data).toEqual({ role: 'owner', status: 'suspended' })
    } finally {
      await service.from('profiles').update({ role: 'user', status: 'active' }).eq('id', bob.userId)
      await admin.cleanup()
    }
  })
})
