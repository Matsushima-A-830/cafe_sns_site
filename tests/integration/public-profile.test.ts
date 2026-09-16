import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveFeedOptions } from '@/lib/posts/feed'
import { getPostList } from '@/lib/posts/post-list'
import {
  getProfileCounts,
  getPublicProfile,
  isBlockedEitherWay,
  isFollowing,
} from '@/lib/profiles/public-profile'
import type { FeedQuery } from '@/lib/validators/feed'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// lib/profiles/public-profile.ts を実 DB に対して動かす。確認したいのは:
//  1. profiles_select_all が using (true) でも非公開列（guardian_email / birth_date / metadata）が出ないこと
//  2. active 以外のプロフィールが 404 相当（null）になること
//  3. 件数が投稿一覧と同じ条件で数えられること（本人が見ても予約行・削除済みが混ざらない）
//  4. ブロック判定が両方向で効くこと

const service = serviceRoleClient()

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文テキスト' }] }],
}

const BASE_TIME = Date.parse('2030-02-01T00:00:00.000Z')
const publishedAt = (offsetMinutes: number) =>
  new Date(BASE_TIME + offsetMinutes * 60_000).toISOString()

let author: AuthedUser
let viewer: AuthedUser
let blocker: AuthedUser
let suspended: AuthedUser

const postIds: string[] = []

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

async function insertPost(
  authorId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: authorId,
    post_type: 'short',
    body_json: bodyJson,
    status: 'published',
    published_at: publishedAt(0),
    ...overrides,
  })
  if (error) throw new Error(`テスト投稿の作成に失敗: ${error.message}`)
  postIds.push(id)
  return id
}

beforeAll(async () => {
  author = await createAuthedProfile({
    username: 'Author_Profile',
    display_name: 'プロフィール著者',
  })
  viewer = await createAuthedProfile({ username: 'viewer_profile' })
  blocker = await createAuthedProfile({ username: 'blocker_profile' })
  suspended = await createAuthedProfile({ username: 'suspended_profile', status: 'suspended' })

  await service.from('profiles').update({ bio: '自己紹介' }).eq('id', author.userId)

  // 公開2件 + 数にも一覧にも出てはいけない3件
  await insertPost(author.userId, { published_at: publishedAt(2) })
  await insertPost(author.userId, { published_at: publishedAt(1) })
  await insertPost(author.userId, { status: 'hidden', published_at: null })
  await insertPost(author.userId, { status: 'archived' })
  await insertPost(author.userId, { deleted_at: new Date().toISOString() })
  // 他人の投稿（グリッドに混ざらないこと）
  await insertPost(viewer.userId)

  await service.from('blocks').insert({ blocker_id: blocker.userId, blocked_id: author.userId })
})

afterAll(async () => {
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  await author?.cleanup()
  await viewer?.cleanup()
  await blocker?.cleanup()
  await suspended?.cleanup()
})

describe('getPublicProfile', () => {
  it('公開してよい列だけを返す（guardian_email / birth_date / metadata を含まない）', async () => {
    const profile = await getPublicProfile(typed(anonClient()), 'author_profile')

    expect(profile).not.toBeNull()
    expect(Object.keys(profile ?? {}).sort()).toEqual([
      'avatarUrl',
      'bio',
      'displayName',
      'id',
      'username',
    ])
  })

  // username は citext。URL の綴りではなく DB 側の綴りを表示に使う
  it('大文字小文字を無視して一致し、正規化された username を返す', async () => {
    const profile = await getPublicProfile(typed(anonClient()), 'AUTHOR_PROFILE')

    expect(profile?.username).toBe('Author_Profile')
  })

  it('status が active でないプロフィールは null', async () => {
    const profile = await getPublicProfile(typed(anonClient()), 'suspended_profile')

    expect(profile).toBeNull()
  })

  it('存在しない username は null', async () => {
    const profile = await getPublicProfile(typed(anonClient()), 'no_such_user')

    expect(profile).toBeNull()
  })

  // 形が不正な値を PostgREST に渡すとエラー（22P02 等）になるので、手前で弾く
  it('username の形式が不正なら DB に問い合わせず null', async () => {
    expect(await getPublicProfile(typed(anonClient()), 'a')).toBeNull()
    expect(await getPublicProfile(typed(anonClient()), 'bad name!')).toBeNull()
  })
})

describe('getProfileCounts', () => {
  it('投稿数は一覧と同じ条件で数える（本人セッションでも予約行・削除済みを含まない）', async () => {
    const counts = await getProfileCounts(typed(author.client), author.userId)

    expect(counts.posts).toBe(2)
  })

  it('フォロー数・フォロワー数は誰から見ても同じ', async () => {
    await service.from('follows').insert({ follower_id: viewer.userId, followee_id: author.userId })

    const fromAnon = await getProfileCounts(typed(anonClient()), author.userId)
    const fromViewer = await getProfileCounts(typed(viewer.client), author.userId)

    expect(fromAnon.followers).toBe(1)
    expect(fromAnon.following).toBe(0)
    expect(fromViewer).toEqual(fromAnon)

    await service
      .from('follows')
      .delete()
      .eq('follower_id', viewer.userId)
      .eq('followee_id', author.userId)
  })
})

describe('isFollowing / isBlockedEitherWay', () => {
  it('フォローしていなければ false、していれば true', async () => {
    expect(await isFollowing(typed(viewer.client), viewer.userId, author.userId)).toBe(false)

    await service.from('follows').insert({ follower_id: viewer.userId, followee_id: author.userId })
    expect(await isFollowing(typed(viewer.client), viewer.userId, author.userId)).toBe(true)

    await service
      .from('follows')
      .delete()
      .eq('follower_id', viewer.userId)
      .eq('followee_id', author.userId)
  })

  it('ブロックは両方向で真になる', async () => {
    expect(await isBlockedEitherWay(typed(blocker.client), author.userId)).toBe(true)
    // ブロックされた側は blocks を読めないが、security definer 経由なので判定できる
    expect(await isBlockedEitherWay(typed(author.client), blocker.userId)).toBe(true)
    expect(await isBlockedEitherWay(typed(viewer.client), author.userId)).toBe(false)
  })
})

describe('投稿グリッド（authorId 絞り込み）', () => {
  const query = (overrides: Partial<FeedQuery> = {}): FeedQuery => ({
    scope: 'new',
    tagSlug: null,
    areaCode: null,
    authorUsername: null,
    ...overrides,
  })

  it('その作者の公開投稿だけを返す', async () => {
    const page = await getPostList(typed(viewer.client), { authorId: author.userId })
    const own = page.items.filter((item) => postIds.includes(item.id))

    expect(own).toHaveLength(2)
    expect(own.every((item) => item.author.id === author.userId)).toBe(true)
  })

  it('resolveFeedOptions は username を authorId に解決する', async () => {
    const resolved = await resolveFeedOptions(
      typed(viewer.client),
      query({ authorUsername: 'author_profile' }),
      viewer.userId,
    )

    expect(resolved?.options.authorId).toBe(author.userId)
  })

  // 「もっと見る」だけがページ本体の404をすり抜けて投稿を返さないこと
  it('停止中・存在しない作者は null（取得せず空状態）', async () => {
    expect(
      await resolveFeedOptions(
        typed(viewer.client),
        query({ authorUsername: 'suspended_profile' }),
        viewer.userId,
      ),
    ).toBeNull()
    expect(
      await resolveFeedOptions(
        typed(viewer.client),
        query({ authorUsername: 'no_such_user' }),
        viewer.userId,
      ),
    ).toBeNull()
  })
})
