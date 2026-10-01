// S_USER_PROFILE_PUBLIC: 他人のプロフィール
// 詳細: docs/design/wireframes/browsing.md#s_user_profile_public他人のプロフィール / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { PostFeed } from '@/components/features/posts/post-feed'
import { BlockButton } from '@/components/features/profiles/block-button'
import { EarnedBadgeRow } from '@/components/features/profiles/earned-badge-row'
import { FollowButton } from '@/components/features/profiles/follow-button'
import { ProfileAvatar } from '@/components/features/profiles/profile-avatar'
import { ProfileCountList } from '@/components/features/profiles/profile-count-list'
import { PublicProfileTabs } from '@/components/features/profiles/public-profile-tabs'
import { RegularCafeGrid } from '@/components/features/profiles/regular-cafe-grid'
import { Button } from '@/components/ui/button'
import { getUserEarnedBadges } from '@/lib/badges/earned'
import { getPostList } from '@/lib/posts/post-list'
import {
  getProfileCounts,
  getPublicProfile,
  isBlockedEitherWay,
  isFollowing,
  type PublicProfile,
} from '@/lib/profiles/public-profile'
import { getUserRegularCafes } from '@/lib/profiles/regulars'
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
  const [counts, following, page, regularCafes, earnedBadges] = await Promise.all([
    getProfileCounts(supabase, profile.id),
    user && !isSelf ? isFollowing(supabase, user.id, profile.id) : Promise.resolve(false),
    getPostList(supabase, { authorId: profile.id, viewerId: user?.id ?? null }),
    getUserRegularCafes(supabase, profile.id),
    getUserEarnedBadges(supabase, profile.id),
  ])

  const query: FeedQuery = {
    scope: 'new',
    tagSlug: null,
    areaCode: null,
    authorUsername: profile.username,
    cafeId: null,
    lat: null,
    lng: null,
  }

  const postsPanel = (
    <PostFeed
      // フォロー状態が変われば visibility='followers' の投稿の見え方も変わる。
      // PostFeed は initialPage を useState の初期値にしか使わないため、
      // router.refresh() だけではフォロー前の一覧が残り続ける
      key={`${profile.id}:${following}`}
      initialPage={page}
      query={query}
      isAuthenticated={user != null}
      emptyMessage={
        isSelf
          ? 'まだ投稿がありません。最初の1件を投稿してみましょう。'
          : `${profile.displayName}さんはまだ投稿していません。`
      }
    />
  )

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col items-center gap-6 text-center md:flex-row md:items-start md:text-left">
        <ProfileAvatar avatarUrl={profile.avatarUrl} displayName={profile.displayName} priority />

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

        {/* 自分のプロフィールにフォローボタンは出さず、マイページへの導線に替える
            （この画面は「他人から見た自分」の確認にも使える） */}
        {isSelf && (
          <Button asChild variant="outline" size="lg">
            <Link href="/me">マイページへ</Link>
          </Button>
        )}

        {!isSelf &&
          (user ? (
            <div className="flex flex-col items-center gap-2 md:items-start">
              <FollowButton
                // key で following ごとに再マウントしていたのは廃止した。フォロー成功後の
                // router.refresh() で following が変わるたびに再マウントされ、送信中に
                // aria-busy へ移していてもフォーカスが body へ落ちてしまうため（D33）。
                // 別タブでの操作によるズレは次のページ遷移まで残るが、実害は小さい
                followeeId={profile.id}
                initialFollowing={following}
              />
              <BlockButton targetUserId={profile.id} />
              {/* 統合「⋯」メニューは別スコープ。BlockButton と同じ判断で単独リンクだけ出す */}
              <Link
                href={`/report/user/${profile.id}`}
                className="text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
              >
                通報する
              </Link>
            </div>
          ) : (
            <Button asChild size="lg">
              <Link href={`/login?next=${encodeURIComponent(`/users/${profile.username}`)}`}>
                ログインしてフォロー
              </Link>
            </Button>
          ))}
      </header>

      <EarnedBadgeRow badges={earnedBadges} />

      {/* 行きつけが0件なら中身1枚しか無いのでタブ自体を出さない（D25・D28と同じ判断） */}
      {regularCafes.length === 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="sr-only">投稿</h2>
          {postsPanel}
        </section>
      ) : (
        <PublicProfileTabs
          postsPanel={postsPanel}
          regularsPanel={
            <RegularCafeGrid
              entries={regularCafes}
              emptyMessage={
                isSelf
                  ? 'まだ行きつけの認定はありません。'
                  : `${profile.displayName}さんの行きつけはまだありません。`
              }
            />
          }
        />
      )}
    </div>
  )
}
