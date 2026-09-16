// S_USER_PROFILE_PUBLIC: 他人のプロフィール
// 詳細: docs/design/wireframes/browsing.md#s_user_profile_public他人のプロフィール / docs/architecture/routing.md
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { PostFeed } from '@/components/features/posts/post-feed'
import { FollowButton } from '@/components/features/profiles/follow-button'
import { Button } from '@/components/ui/button'
import { getPostList } from '@/lib/posts/post-list'
import {
  getProfileCounts,
  getPublicProfile,
  isBlockedEitherWay,
  isFollowing,
  type ProfileCounts,
  type PublicProfile,
} from '@/lib/profiles/public-profile'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { createClient } from '@/lib/supabase/server'
import type { FeedQuery } from '@/lib/validators/feed'

// routing.md は ISR (60s) を想定していたが、投稿グリッドのブロック判定とフォローボタンの
// 初期状態に閲覧者のセッションが要るため SSR。経緯は pending-items D23

type PageProps = { params: Promise<{ username: string }> }

/** Server Component 内の複数箇所から同じクライアントを使う（cookies() の読み直しを避ける） */
const getSupabase = cache(async () => createClient())

/**
 * 404 にする条件をすべてここに集約する。ブロック判定を本体側だけに置くと、
 * generateMetadata は成功して 404 ページのタイトルと description に相手の表示名・bio が
 * 載ってしまう（存在とブロック関係が漏れる — pending-items D29）。
 * generateMetadata と本体からの2回の呼び出しは cache() で1回にまとめる
 */
const loadProfile = cache(async (username: string): Promise<PublicProfile | null> => {
  const supabase = await getSupabase()
  const profile = await getPublicProfile(supabase, username)
  if (!profile) return null

  // ブロックは向きを区別せず 404。「ブロックされた側に気づかれるのを避ける」
  // blocks_select_own の方針を壊さないため
  return (await isBlockedEitherWay(supabase, profile.id)) ? null : profile
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const profile = await loadProfile(username)
  if (!profile) return { title: 'ユーザーが見つかりません' }

  // ルートの template が「 | カフェSNS」を付ける
  return {
    title: profile.displayName,
    description: profile.bio ?? `@${profile.username}さんのプロフィール`,
  }
}

function ProfileCountList({ counts }: { counts: ProfileCounts }) {
  const items = [
    { label: '投稿', value: counts.posts },
    { label: 'フォロー', value: counts.following },
    { label: 'フォロワー', value: counts.followers },
  ]

  return (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-base text-foreground">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="font-bold">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ProfileAvatar({ profile }: { profile: PublicProfile }) {
  // avatar_url は API 直叩きで書き換えられる（オンボーディングの Zod は URL 形式しか見ない）。
  // 外部ホストを許すと、プロフィールを開いた全員のIP・UA・Referer が第三者に渡る
  const url = profile.avatarUrl && isStoragePublicUrl(profile.avatarUrl) ? profile.avatarUrl : null

  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="flex size-24 shrink-0 items-center justify-center rounded-full bg-muted text-3xl text-muted-foreground"
      >
        {profile.displayName.slice(0, 1)}
      </span>
    )
  }

  return (
    <Image
      src={url}
      alt=""
      width={96}
      height={96}
      priority
      className="size-24 shrink-0 rounded-full object-cover"
    />
  )
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params
  const profile = await loadProfile(username)
  if (!profile) notFound()

  const supabase = await getSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isSelf = user?.id === profile.id

  // 表示に要る残りは往復を直列にしない（CLAUDE.md パフォーマンス「N+1回避」）
  const [counts, following, page] = await Promise.all([
    getProfileCounts(supabase, profile.id),
    user && !isSelf ? isFollowing(supabase, user.id, profile.id) : Promise.resolve(false),
    getPostList(supabase, { authorId: profile.id }),
  ])

  // バッジ（user_badges）・「行きつけ」タブ（regular_customers）・⋯メニューの通報（reports）は
  // 元テーブルが未作成のため出していない（pending-items D28）
  const query: FeedQuery = {
    scope: 'new',
    tagSlug: null,
    areaCode: null,
    authorUsername: profile.username,
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col items-center gap-6 text-center md:flex-row md:items-start md:text-left">
        <ProfileAvatar profile={profile} />

        <div className="flex min-w-0 flex-1 flex-col items-center gap-3 md:items-start">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-foreground">{profile.displayName}</h1>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
          </div>

          {profile.bio && (
            <p className="max-w-prose text-base break-words whitespace-pre-wrap text-foreground">
              {profile.bio}
            </p>
          )}

          <ProfileCountList counts={counts} />
        </div>

        {/* 自分のプロフィールにフォローボタンは出さない。S_MYPAGE（/me）は未実装のため、
            当面は自分の公開プロフィールとしてこの画面をそのまま見せる */}
        {!isSelf &&
          (user ? (
            <FollowButton
              // initialFollowing は useState の初期値にしかならない。別タブでの
              // フォロー解除などでサーバー側の値がずれたら state ごと作り直す
              key={`${profile.id}:${following}`}
              followeeId={profile.id}
              initialFollowing={following}
            />
          ) : (
            <Button asChild size="lg">
              <Link href={`/login?next=${encodeURIComponent(`/users/${profile.username}`)}`}>
                ログインしてフォロー
              </Link>
            </Button>
          ))}
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="sr-only">投稿</h2>
        <PostFeed
          // フォロー状態が変われば visibility='followers' の投稿の見え方も変わる。
          // PostFeed は initialPage を useState の初期値にしか使わないため、
          // router.refresh() だけではフォロー前の一覧が残り続ける
          key={`${profile.id}:${following}`}
          initialPage={page}
          query={query}
          emptyMessage={
            isSelf
              ? 'まだ投稿がありません。最初の1件を投稿してみましょう。'
              : `${profile.displayName}さんはまだ投稿していません。`
          }
        />
      </section>
    </div>
  )
}
