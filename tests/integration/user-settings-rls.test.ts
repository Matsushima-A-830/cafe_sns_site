import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AuthedUser, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

const CHECK_VIOLATION = '23514'

const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_settings' })
  bob = await createAuthedProfile({ username: 'bob_settings' })
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
})

describe('user_settings の自動作成', () => {
  it('profiles を作ると既定値の行が同時にできる（アプリは行の不在を考慮しない）', async () => {
    const { data, error } = await alice.client
      .from('user_settings')
      .select('*')
      .eq('user_id', alice.userId)
      .single()

    expect(error).toBeNull()
    expect(data).toMatchObject({
      user_id: alice.userId,
      notify_like: true,
      notify_comment: true,
      notify_follow: true,
      notify_email: true,
      use_location: true,
      allow_recommendation: true,
      font_scale: 'normal',
    })
  })
})

describe('user_settings の RLS', () => {
  it('自分の設定は読める', async () => {
    const { data, error } = await alice.client.from('user_settings').select('font_scale')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('他人の設定は読めない', async () => {
    const { data, error } = await alice.client
      .from('user_settings')
      .select('font_scale')
      .eq('user_id', bob.userId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('自分の設定は更新できる', async () => {
    const { data, error } = await alice.client
      .from('user_settings')
      .update({ notify_like: false, font_scale: 'large' })
      .eq('user_id', alice.userId)
      .select('notify_like, font_scale')

    expect(error).toBeNull()
    expect(data).toEqual([{ notify_like: false, font_scale: 'large' }])
  })

  it('他人の設定は更新できない（対象0件）', async () => {
    const { data, error } = await alice.client
      .from('user_settings')
      .update({ notify_like: false })
      .eq('user_id', bob.userId)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await service
      .from('user_settings')
      .select('notify_like')
      .eq('user_id', bob.userId)
      .single()
    expect(after.data?.notify_like).toBe(true)
  })

  it('DELETE はできない（profiles の削除に追随させる）', async () => {
    const { data, error } = await alice.client
      .from('user_settings')
      .delete()
      .eq('user_id', alice.userId)
      .select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const after = await service.from('user_settings').select('user_id').eq('user_id', alice.userId)
    expect(after.data).toHaveLength(1)
  })

  it('未知の font_scale は拒否される', async () => {
    const { error } = await alice.client
      .from('user_settings')
      .update({ font_scale: 'huge' })
      .eq('user_id', alice.userId)

    expect(error?.code).toBe(CHECK_VIOLATION)
  })
})
