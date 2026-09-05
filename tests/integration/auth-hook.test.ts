import { afterEach, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  createAuthedProfile,
  createAuthedUser,
  serviceRoleClient,
} from '../helpers/supabase'

const service = serviceRoleClient()

// middleware は Edge Runtime で DB を引けないので、role / status / onboarded を
// JWT のカスタムクレイムだけで判定する（docs/architecture/routing.md）
function appMetadataOf(accessToken: string): Record<string, unknown> {
  const payload = accessToken.split('.')[1]
  if (!payload) throw new Error('アクセストークンの形式が不正')
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  return decoded.app_metadata ?? {}
}

let user: AuthedUser | undefined

afterEach(async () => {
  await user?.cleanup()
  user = undefined
})

describe('custom_access_token_hook', () => {
  it('profiles の role / status / onboarded をクレイムに載せる', async () => {
    user = await createAuthedProfile({ username: 'claim_user', role: 'owner' })
    const session = await user.refreshSession()

    expect(appMetadataOf(session.access_token)).toMatchObject({
      role: 'owner',
      status: 'active',
      onboarded: false,
    })
  })

  it('onboarded_at が入っていれば onboarded=true になる', async () => {
    user = await createAuthedProfile({
      username: 'claim_onboarded',
      onboarded_at: new Date().toISOString(),
    })
    const session = await user.refreshSession()

    expect(appMetadataOf(session.access_token)).toMatchObject({ onboarded: true })
  })

  // サインアップ直後（生年月日の入力前）は profiles 行がまだ無い。
  // ここで落ちるとログインそのものができなくなるので、必ず素通りさせる
  it('profiles が無くてもトークンは発行される', async () => {
    user = await createAuthedUser()
    const session = await user.refreshSession()

    expect(session.access_token).toBeTruthy()
    expect(appMetadataOf(session.access_token)).not.toHaveProperty('role')
  })

  it('role を変えて再ログインするとクレイムも変わる', async () => {
    user = await createAuthedProfile({ username: 'claim_promoted' })
    expect(appMetadataOf((await user.refreshSession()).access_token)).toMatchObject({
      role: 'user',
    })

    await service.from('profiles').update({ role: 'admin' }).eq('id', user.userId)

    expect(appMetadataOf((await user.refreshSession()).access_token)).toMatchObject({
      role: 'admin',
    })
  })
})
