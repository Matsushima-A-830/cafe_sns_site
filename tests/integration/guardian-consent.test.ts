import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const anon = anonClient()
const service = serviceRoleClient()

let user: AuthedUser | undefined

afterEach(async () => {
  await user?.cleanup()
  user = undefined
})

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// setToken は「メールに載る生のトークン」を受け取り、DBにはハッシュだけを書く
// （approve_guardian_consent RPCと同じ計算式。lib/utils/guardian-consent-token.ts）
async function setToken(userId: string, token: string | null, expiresInMs: number) {
  const { error } = await service
    .from('profiles')
    .update({
      guardian_consent_token_hash: token ? hash(token) : null,
      guardian_consent_token_expires_at: token
        ? new Date(Date.now() + expiresInMs).toISOString()
        : null,
    })
    .eq('id', userId)
  if (error) throw new Error(`テスト用トークン設定に失敗: ${error.message}`)
}

// approve_guardian_consent は anon（未ログインの保護者）から呼ばれる想定のRPC
//   supabase/migrations/20260927010000_add_guardian_consent_token.sql
describe('approve_guardian_consent', () => {
  it('有効なトークンなら未ログインでも承認でき、statusがactiveになる', async () => {
    user = await createAuthedProfile({ status: 'pending_consent' })
    await setToken(user.userId, 'valid-token', 60_000)

    const { data, error } = await anon.rpc('approve_guardian_consent', { p_token: 'valid-token' })
    expect(error).toBeNull()
    expect(data).toBe(true)

    const { data: profile } = await service
      .from('profiles')
      .select('status, guardian_consent_at, guardian_consent_token_hash')
      .eq('id', user.userId)
      .single()
    expect(profile?.status).toBe('active')
    expect(profile?.guardian_consent_at).not.toBeNull()
    expect(profile?.guardian_consent_token_hash).toBeNull()
  })

  it('DBに保存されるのはハッシュのみで、生トークンでは照合できない（漏洩対策）', async () => {
    user = await createAuthedProfile({ status: 'pending_consent' })
    await setToken(user.userId, 'plain-secret-token', 60_000)

    const { data: profile } = await service
      .from('profiles')
      .select('guardian_consent_token_hash')
      .eq('id', user.userId)
      .single()
    expect(profile?.guardian_consent_token_hash).not.toBe('plain-secret-token')
    expect(profile?.guardian_consent_token_hash).toBe(hash('plain-secret-token'))

    // 仮に guardian_consent_token_hash の値そのものを p_token として叩いても通らない
    const { data } = await anon.rpc('approve_guardian_consent', {
      p_token: profile?.guardian_consent_token_hash,
    })
    expect(data).toBe(false)
  })

  it('期限切れトークンは拒否し、statusは変わらない', async () => {
    user = await createAuthedProfile({ status: 'pending_consent' })
    await setToken(user.userId, 'expired-token', -60_000)

    const { data, error } = await anon.rpc('approve_guardian_consent', {
      p_token: 'expired-token',
    })
    expect(error).toBeNull()
    expect(data).toBe(false)

    const { data: profile } = await service
      .from('profiles')
      .select('status')
      .eq('id', user.userId)
      .single()
    expect(profile?.status).toBe('pending_consent')
  })

  it('存在しないトークンは拒否する', async () => {
    const { data, error } = await anon.rpc('approve_guardian_consent', {
      p_token: 'no-such-token',
    })
    expect(error).toBeNull()
    expect(data).toBe(false)
  })

  it('一度使ったトークンは再利用できない（使用済みでnullに戻る）', async () => {
    user = await createAuthedProfile({ status: 'pending_consent' })
    await setToken(user.userId, 'reuse-token', 60_000)

    const first = await anon.rpc('approve_guardian_consent', { p_token: 'reuse-token' })
    expect(first.data).toBe(true)

    const second = await anon.rpc('approve_guardian_consent', { p_token: 'reuse-token' })
    expect(second.data).toBe(false)
  })

  it('status が pending_consent 以外（既にactive）なら拒否する', async () => {
    user = await createAuthedProfile({ status: 'active' })
    await setToken(user.userId, 'already-active-token', 60_000)

    const { data } = await anon.rpc('approve_guardian_consent', {
      p_token: 'already-active-token',
    })
    expect(data).toBe(false)
  })
})

// /code-review で発覚: guard_privileged_profile_columns が role/status/username しか
// 守っておらず、pending_consent の本人が自分でトークン列を書き換えて自己承認できていた。
//   supabase/migrations/20260927020000_guard_guardian_consent_token_columns.sql
describe('自己承認バイパスの防止', () => {
  it('pending_consentの本人は自分のguardian_consent_token_hashを直接書き換えられない', async () => {
    user = await createAuthedProfile({ status: 'pending_consent' })

    const { error } = await user.client
      .from('profiles')
      .update({
        guardian_consent_token_hash: hash('self-forged-token'),
        guardian_consent_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq('id', user.userId)

    expect(error?.message).toContain('FORBIDDEN')

    // 万一トリガーをすり抜けていた場合の保険として、実際にRPCが通らないことも確認する
    const { data } = await anon.rpc('approve_guardian_consent', { p_token: 'self-forged-token' })
    expect(data).toBe(false)
  })
})

// /code-review で発覚: guard_privileged_profile_columns のコメントは「service_role限定」と
// 書いていたが、実装は role/status/username と同じ is_admin() バイパスを流用しており、
// 認証済みadmin自身のセッションからもトークン列を書き換えられてしまっていた。
//   supabase/migrations/20260927030000_tighten_guardian_consent_token_guard.sql
describe('トークン列はis_adminでもバイパスできない', () => {
  it('admin自身のセッションでも他人のguardian_consent_token_hashを書き換えられない', async () => {
    const admin = await createAuthedProfile({ role: 'admin' })
    user = await createAuthedProfile({ status: 'pending_consent' })

    const { error } = await admin.client
      .from('profiles')
      .update({
        guardian_consent_token_hash: hash('admin-forged-token'),
        guardian_consent_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq('id', user.userId)

    expect(error?.message).toContain('FORBIDDEN')
    await admin.cleanup()
  })

  it('admin自身のセッションでも他人のguardian_consent_token_issued_atを書き換えられない（レート制限のリセット防止）', async () => {
    const admin = await createAuthedProfile({ role: 'admin' })
    user = await createAuthedProfile({ status: 'pending_consent' })

    const { error } = await admin.client
      .from('profiles')
      .update({ guardian_consent_token_issued_at: new Date().toISOString() })
      .eq('id', user.userId)

    expect(error?.message).toContain('FORBIDDEN')
    await admin.cleanup()
  })

  it('admin自身のセッションでも他人のroleは書き換えられる（role/statusのis_adminバイパスは維持）', async () => {
    const admin = await createAuthedProfile({ role: 'admin' })
    user = await createAuthedProfile({ status: 'pending_consent' })

    const { error } = await admin.client
      .from('profiles')
      .update({ role: 'owner' })
      .eq('id', user.userId)

    expect(error).toBeNull()
    await admin.cleanup()
  })
})
