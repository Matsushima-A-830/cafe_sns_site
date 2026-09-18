import type { SupabaseClient } from '@supabase/supabase-js'
import { usernameSchema } from '@/lib/validators/onboarding'
import type { Database } from '@/types/database'

/**
 * 他人のプロフィール（S_USER_PROFILE_PUBLIC）の読み取り。投稿詳細と同じく
 * Server Component から呼ぶ純粋な読み取りなので Server Actions ではなくここに置く
 *   docs/design/wireframes/browsing.md #S_USER_PROFILE_PUBLIC
 */

type Client = SupabaseClient<Database>

export type PublicProfile = {
  id: string
  username: string
  displayName: string
  bio: string | null
  avatarUrl: string | null
}

export type ProfileCounts = { posts: number; following: number; followers: number }

/**
 * profiles から公開してよい列だけを取り出す。
 *
 * `select('*')` は禁止。profiles_select_all は `using (true)` で行も列も絞らないため、
 * guardian_email（保護者のメールアドレス）・birth_date・metadata がそのまま
 * クライアントへ渡る。投稿と違い RLS は何も守っていない
 *   supabase/migrations/20260905130000_create_profiles.sql profiles_select_all
 */
const PUBLIC_COLUMNS = 'id, username, display_name, bio, avatar_url, status'

/**
 * username から1件引く。status が active 以外（suspended / deleted / pending_consent）は
 * null を返し、呼び出し元で404にする（存在自体を漏らさない — pending-items D29）。
 *
 * username は citext なので `.eq()` は大小を無視して一致する。表示には DB 側の綴りを使い、
 * URL に来た綴りをそのまま出さない
 */
export async function getPublicProfile(
  supabase: Client,
  username: string,
): Promise<PublicProfile | null> {
  // 形が不正だと PostgREST のエラーになるので、DB に投げる前に弾く
  if (!usernameSchema.safeParse(username).success) return null

  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_COLUMNS)
    .eq('username', username)
    .maybeSingle()

  if (error) throw new Error(`プロフィールの取得に失敗しました: ${error.message}`)
  if (data?.status !== 'active') return null

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
  }
}

/**
 * id から1件引く（マイページ S_MYPAGE）。セッションが持っているのは user.id だけで、
 * username を引くためだけに往復を増やすのは本末転倒なので getPublicProfile とは別に用意する。
 *
 * 取る列は PUBLIC_COLUMNS のまま。「自分のページだから全列でよい」は成り立たない
 * — /me の HTML は RSC ペイロードとしてクライアントに渡るので、取った列はそのまま
 * ブラウザに届く（profiles_select_all は行も列も絞らない）。
 *
 * status が active 以外は null。middleware.ts が pending_consent / suspended を
 * それぞれ /account/pending・/account/suspended へ隔離するので通常は到達しないが、
 * matcher の変更で無防備になるのを避けるため呼び出し元でも分岐できるようにしておく
 */
export async function getProfileById(
  supabase: Client,
  profileId: string,
): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_COLUMNS)
    .eq('id', profileId)
    .maybeSingle()

  if (error) throw new Error(`プロフィールの取得に失敗しました: ${error.message}`)
  if (data?.status !== 'active') return null

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
  }
}

/**
 * ヘッダの「投稿 42 · フォロー 128 · フォロワー 89」。
 *
 * 投稿数は一覧（getPostList）と必ず同じ条件で数える。posts_select_own は author_id 一致だけを
 * 見るため、条件を省くと本人が開いたときだけ予約行・archived・論理削除済みが数に入る。
 * visibility='followers' の投稿は RLS で閲覧者ごとに見える件数が変わるので、
 * 非フォロワーから見ると数字が小さくなる（一覧の件数とは一致する）
 */
export async function getProfileCounts(
  supabase: Client,
  profileId: string,
): Promise<ProfileCounts> {
  const head = { count: 'exact' as const, head: true }

  const [posts, following, followers] = await Promise.all([
    supabase
      .from('posts')
      .select('id', head)
      .eq('author_id', profileId)
      .eq('status', 'published')
      .is('deleted_at', null),
    supabase.from('follows').select('followee_id', head).eq('follower_id', profileId),
    supabase.from('follows').select('follower_id', head).eq('followee_id', profileId),
  ])

  for (const result of [posts, following, followers]) {
    if (result.error)
      throw new Error(`プロフィールの件数取得に失敗しました: ${result.error.message}`)
  }

  return {
    posts: posts.count ?? 0,
    following: following.count ?? 0,
    followers: followers.count ?? 0,
  }
}

/**
 * 呼び出し元と相手がどちらかの向きでブロックし合っているか。
 * blocks_select_own は「ブロックした側」しか読めないので、両向きを見るにはこの
 * SECURITY DEFINER 関数を通す（anon では auth.uid() が null で常に false）
 *   supabase/migrations/20260907120000_create_posts.sql is_blocked_either_way
 */
export async function isBlockedEitherWay(supabase: Client, otherId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_blocked_either_way', { p_other_id: otherId })
  if (error) throw new Error(`ブロック判定に失敗しました: ${error.message}`)
  return data === true
}

/** フォローボタンの初期状態。未ログインなら常に false */
export async function isFollowing(
  supabase: Client,
  followerId: string,
  followeeId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId)

  if (error) throw new Error(`フォロー状態の取得に失敗しました: ${error.message}`)
  return (count ?? 0) > 0
}
