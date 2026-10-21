import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'
const CHECK_VIOLATION = '23514'

const anon = anonClient()
const service = serviceRoleClient()

let alice: AuthedUser
let bob: AuthedUser
let suspendedUser: AuthedUser
let pendingConsentUser: AuthedUser

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_follow' })
  bob = await createAuthedProfile({ username: 'bob_follow' })
  suspendedUser = await createAuthedProfile({ username: 'suspended_follow', status: 'suspended' })
  pendingConsentUser = await createAuthedProfile({
    username: 'pending_follow',
    status: 'pending_consent',
  })
})

afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
  await suspendedUser?.cleanup()
  await pendingConsentUser?.cleanup()
})

describe('follows の RLS', () => {
  it('自分を follower としてフォローできる', async () => {
    const { error } = await alice.client
      .from('follows')
      .insert({ follower_id: alice.userId, followee_id: bob.userId })

    expect(error).toBeNull()
  })

  // ブロック関係がある場合に隠れることの確認は下の
  // 「follows_select_all のブロック反映（D36）」で行う
  it('フォロー関係は誰でも読める（フォロワー一覧の表示）', async () => {
    const { data, error } = await anon
      .from('follows')
      .select('follower_id')
      .eq('followee_id', bob.userId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('他人を follower に仕立てたフォローはできない', async () => {
    const { error } = await alice.client
      .from('follows')
      .insert({ follower_id: bob.userId, followee_id: alice.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('自分自身はフォローできない', async () => {
    const { error } = await alice.client
      .from('follows')
      .insert({ follower_id: alice.userId, followee_id: alice.userId })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('status=suspended のユーザーは自分を follower としてもフォローできない', async () => {
    const { error } = await suspendedUser.client
      .from('follows')
      .insert({ follower_id: suspendedUser.userId, followee_id: bob.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  // 未成年の保護者同意待ちアカウント。is_active_user() ガード導入の主目的
  it('status=pending_consent のユーザーは自分を follower としてもフォローできない', async () => {
    const { error } = await pendingConsentUser.client
      .from('follows')
      .insert({ follower_id: pendingConsentUser.userId, followee_id: bob.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('他人のフォローは解除できない（対象0件）', async () => {
    const { data } = await bob.client
      .from('follows')
      .delete()
      .eq('follower_id', alice.userId)
      .select()

    expect(data).toEqual([])

    const after = await service
      .from('follows')
      .select('follower_id')
      .eq('follower_id', alice.userId)
    expect(after.data).toHaveLength(1)
  })

  it('自分のフォローは解除できる', async () => {
    const { data } = await alice.client
      .from('follows')
      .delete()
      .eq('follower_id', alice.userId)
      .select()

    expect(data).toHaveLength(1)
  })
})

describe('blocks の RLS', () => {
  it('自分のブロックは作成・参照できる', async () => {
    const created = await alice.client
      .from('blocks')
      .insert({ blocker_id: alice.userId, blocked_id: bob.userId })
    expect(created.error).toBeNull()

    const { data, error } = await alice.client.from('blocks').select('blocked_id')
    expect(error).toBeNull()
    expect(data).toEqual([{ blocked_id: bob.userId }])
  })

  // ブロックされた側に気づかれないよう、blocks は本人以外から見えてはいけない
  it('ブロックされた側からは見えない', async () => {
    const { data, error } = await bob.client.from('blocks').select('blocker_id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('未ログインからも見えない', async () => {
    const { data, error } = await anon.from('blocks').select('blocker_id')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('他人になりすましてブロックはできない', async () => {
    const { error } = await bob.client
      .from('blocks')
      .insert({ blocker_id: alice.userId, blocked_id: bob.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })
})

// 20260916120000 で follows_insert_own に followee 側のガードを足した。
// 以前は「ブロックしている/されている相手」「停止中の相手」を誰でもフォローできた
describe('follows_insert_own の followee 側ガード', () => {
  let blocker: AuthedUser
  let blocked: AuthedUser
  let target: AuthedUser
  let suspendedTarget: AuthedUser

  beforeAll(async () => {
    blocker = await createAuthedProfile({ username: 'blocker_guard' })
    blocked = await createAuthedProfile({ username: 'blocked_guard' })
    target = await createAuthedProfile({ username: 'target_guard' })
    suspendedTarget = await createAuthedProfile({
      username: 'suspended_target_guard',
      status: 'suspended',
    })

    await service.from('blocks').insert({ blocker_id: blocker.userId, blocked_id: blocked.userId })
  })

  afterAll(async () => {
    await blocker?.cleanup()
    await blocked?.cleanup()
    await target?.cleanup()
    await suspendedTarget?.cleanup()
  })

  it('自分がブロックしている相手はフォローできない', async () => {
    const { error } = await blocker.client
      .from('follows')
      .insert({ follower_id: blocker.userId, followee_id: blocked.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  // ブロックされた側は blocks を読めないので、判定は is_blocked_either_way（security definer）が担う
  it('自分をブロックしている相手はフォローできない', async () => {
    const { error } = await blocked.client
      .from('follows')
      .insert({ follower_id: blocked.userId, followee_id: blocker.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('status=suspended の相手はフォローできない', async () => {
    const { error } = await target.client
      .from('follows')
      .insert({ follower_id: target.userId, followee_id: suspendedTarget.userId })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('ブロック関係のない active な相手はフォローできる', async () => {
    const { error } = await target.client
      .from('follows')
      .insert({ follower_id: target.userId, followee_id: blocker.userId })

    expect(error).toBeNull()
  })
})

// 20260916120100: ブロック成立時に両方向のフォローを切るトリガー。
// insert 時のガードだけだと「フォロー済みの相手をあとからブロック」で行が残る
describe('blocks 作成時の follows 解除', () => {
  let one: AuthedUser
  let two: AuthedUser

  beforeAll(async () => {
    one = await createAuthedProfile({ username: 'one_unfollow_on_block' })
    two = await createAuthedProfile({ username: 'two_unfollow_on_block' })

    await service.from('follows').insert([
      { follower_id: one.userId, followee_id: two.userId },
      { follower_id: two.userId, followee_id: one.userId },
    ])
  })

  afterAll(async () => {
    await one?.cleanup()
    await two?.cleanup()
  })

  it('相互フォローでも両方向の行が消える', async () => {
    const before = await service
      .from('follows')
      .select('follower_id')
      .in('follower_id', [one.userId, two.userId])
    expect(before.data).toHaveLength(2)

    const { error } = await one.client
      .from('blocks')
      .insert({ blocker_id: one.userId, blocked_id: two.userId })
    expect(error).toBeNull()

    // ブロックされた側のフォローはブロックした本人には消せない（follows_delete_own）。
    // security definer のトリガーが両方向を消していることを確かめる
    const after = await service
      .from('follows')
      .select('follower_id')
      .in('follower_id', [one.userId, two.userId])
    expect(after.data).toEqual([])
  })
})

// 20261012: status が active から外れたら follows を両方向削除するトリガー。
// INSERT 時のガードだけだと「フォロー後に相手が停止」で行が残り続ける（D29 対応案 d）
describe('profiles.status が active から外れたときの follows 解除', () => {
  let one: AuthedUser
  let two: AuthedUser
  let outsider: AuthedUser

  beforeAll(async () => {
    one = await createAuthedProfile({ username: 'one_suspend_cleanup' })
    two = await createAuthedProfile({ username: 'two_suspend_cleanup' })
    outsider = await createAuthedProfile({ username: 'outsider_suspend_cleanup' })

    await service.from('follows').insert([
      { follower_id: one.userId, followee_id: two.userId },
      { follower_id: two.userId, followee_id: one.userId },
      { follower_id: outsider.userId, followee_id: two.userId },
    ])
  })

  afterAll(async () => {
    await one?.cleanup()
    await two?.cleanup()
    await outsider?.cleanup()
  })

  it('相互フォローの両方向が消え、無関係な第三者のフォローは残る', async () => {
    const before = await service
      .from('follows')
      .select('follower_id, followee_id')
      .in('follower_id', [one.userId, two.userId, outsider.userId])
    expect(before.data).toHaveLength(3)

    const { error } = await service
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', one.userId)
    expect(error).toBeNull()

    const after = await service
      .from('follows')
      .select('follower_id, followee_id')
      .in('follower_id', [one.userId, two.userId, outsider.userId])
    // one 絡みの2件（one→two, two→one）は消え、outsider→two だけ残る
    expect(after.data).toEqual([{ follower_id: outsider.userId, followee_id: two.userId }])
  })
})

// 20261020: follows_select_all にブロックを反映（D36）。likes_select_all に
// not is_blocked_either_way(user_id) を入れたのと同種の対応だが、follows は
// follower_id / followee_id の両方向があるため、どちらの列にブロック相手が
// 出てきても行を隠す必要がある（直接のブロック相手との行は delete_follows_on_block が
// 消すので、ここで確かめるのは「ブロック相手が第三者との行に出てくるケース」）
describe('follows_select_all のブロック反映（D36）', () => {
  let blocker: AuthedUser
  let blocked: AuthedUser
  let outsider: AuthedUser

  beforeAll(async () => {
    blocker = await createAuthedProfile({ username: 'blocker_follows_vis' })
    blocked = await createAuthedProfile({ username: 'blocked_follows_vis' })
    outsider = await createAuthedProfile({ username: 'outsider_follows_vis' })

    // outsider → blocked（blocked が followee として出てくる行）
    // blocked → outsider（blocked が follower として出てくる行）
    await service.from('follows').insert([
      { follower_id: outsider.userId, followee_id: blocked.userId },
      { follower_id: blocked.userId, followee_id: outsider.userId },
    ])
    await service.from('blocks').insert({ blocker_id: blocker.userId, blocked_id: blocked.userId })
  })

  afterAll(async () => {
    await blocker?.cleanup()
    await blocked?.cleanup()
    await outsider?.cleanup()
  })

  it('ブロック相手が followee 列に出てくる行は見えない', async () => {
    const { data, error } = await blocker.client
      .from('follows')
      .select('follower_id')
      .eq('followee_id', blocked.userId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('ブロック相手が follower 列に出てくる行は見えない', async () => {
    const { data, error } = await blocker.client
      .from('follows')
      .select('followee_id')
      .eq('follower_id', blocked.userId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('ブロックと無関係な第三者からは普通に見える', async () => {
    const { data, error } = await outsider.client
      .from('follows')
      .select('follower_id')
      .eq('followee_id', blocked.userId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('未ログインからは誰のブロックも反映されず見える（auth.uid() が null）', async () => {
    const { data, error } = await anon
      .from('follows')
      .select('follower_id')
      .eq('followee_id', blocked.userId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

describe('count_following / count_followers RPC（D36）', () => {
  let userA: AuthedUser
  let userB: AuthedUser
  let blocker: AuthedUser

  beforeAll(async () => {
    userA = await createAuthedProfile({ username: 'rpc_follow_user_a' })
    userB = await createAuthedProfile({ username: 'rpc_follow_user_b' })
    blocker = await createAuthedProfile({ username: 'rpc_follow_blocker' })

    await service.from('follows').insert([
      { follower_id: userA.userId, followee_id: userB.userId },
      { follower_id: blocker.userId, followee_id: userB.userId },
    ])
  })

  afterAll(async () => {
    await userA?.cleanup()
    await userB?.cleanup()
    await blocker?.cleanup()
  })

  it('フォロー数・フォロワー数は呼び出しセッションと無関係なブロックの影響を受けない', async () => {
    // blocker と userA は何の関係も無いが、blocker が誰かをブロックしていても
    // userB のフォロワー数は変わらない（閲覧者非依存を保つのが RPC を使う目的）
    await service.from('blocks').insert({
      blocker_id: blocker.userId,
      blocked_id: userA.userId,
    })

    const fromAnon = await anon.rpc('count_followers', { p_user_id: userB.userId })
    const fromBlocker = await blocker.client.rpc('count_followers', { p_user_id: userB.userId })

    expect(fromAnon.error).toBeNull()
    expect(fromAnon.data).toBe(2)
    expect(fromBlocker.data).toBe(fromAnon.data)

    await service
      .from('blocks')
      .delete()
      .eq('blocker_id', blocker.userId)
      .eq('blocked_id', userA.userId)
  })

  it('count_following は follower_id 一致で数える', async () => {
    const { data, error } = await anon.rpc('count_following', { p_user_id: userA.userId })

    expect(error).toBeNull()
    expect(data).toBe(1)
  })
})
