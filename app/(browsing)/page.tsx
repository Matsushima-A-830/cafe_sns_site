// S_HOME / S_MY_HOME: ホーム / タイムライン
// 詳細: docs/design/wireframes/browsing.md#s_home--s_my_homeホーム--タイムライン
import type { Metadata } from 'next'
import { FeedTabs } from '@/components/features/feed/feed-tabs'
import { GuestHint } from '@/components/features/feed/guest-hint'
import { HomeSideNav } from '@/components/features/feed/home-side-nav'
import { MoodEntry } from '@/components/features/feed/mood-entry'
import { PendingConsentBanner } from '@/components/features/feed/pending-consent-banner'
import { SuggestedTags } from '@/components/features/feed/suggested-tags'
import { PostFeed } from '@/components/features/posts/post-feed'
import { getMoodTags, resolveFeedOptions } from '@/lib/posts/feed'
import { getPostList, type PostListPage } from '@/lib/posts/post-list'
import { decodeAppMetadataClaims } from '@/lib/supabase/claims'
import { createClient } from '@/lib/supabase/server'
import { firstParam } from '@/lib/utils/search-params'
import { parseFeedQuery } from '@/lib/validators/feed'

// 認証状態で出し分けるうえ、ブロック判定に閲覧者のセッションが要るため SSR
//   docs/architecture/routing.md / pending-items D23

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = {
  title: 'ホーム',
  description: '気分やシーンからカフェを見つけて、行きつけと繋がるSNS。',
}

const EMPTY_PAGE: PostListPage = { items: [], nextCursor: null }

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isFollowingTab = firstParam(params.tab) === 'following' && user != null
  const query = parseFeedQuery({
    scope: isFollowingTab ? 'following' : 'recommended',
    tagSlug: firstParam(params.tag),
    areaCode: firstParam(params.area),
  })

  const [moodTags, resolved] = await Promise.all([
    getMoodTags(supabase),
    resolveFeedOptions(supabase, query, user?.id ?? null),
  ])
  const page = resolved ? await getPostList(supabase, resolved.options) : EMPTY_PAGE

  // pending_consent バナー用。getUser() が既にトークンをサーバー検証済みなので、
  // ここでの getSession() はローカルCookieを読むだけ（ネットワーク不要）。
  // profiles を再度SELECTしなくても middleware と同じJWTクレイムから読める
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const claims = session ? decodeAppMetadataClaims(session.access_token) : null

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8">
      <HomeSideNav current="home" isAuthed={user != null} />

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <h1 className="sr-only">ホーム</h1>

        <MoodEntry tags={moodTags} />

        {user && (
          <FeedTabs
            label="フィードの種類"
            currentKey={query.scope}
            tabs={[
              { key: 'recommended', label: '発見', href: '/' },
              { key: 'following', label: 'フォロー中', href: '/?tab=following' },
            ]}
          />
        )}

        {!user && <GuestHint />}
        {claims?.status === 'pending_consent' && <PendingConsentBanner />}

        <PostFeed
          // タブ・絞り込みが変わったら追記済みの一覧を破棄する。同じ位置の同じ
          // コンポーネントは React が state を持ち越すため、前のタブの投稿が残り続ける
          key={`${query.scope}:${query.tagSlug}:${query.areaCode}`}
          initialPage={page}
          query={query}
          isAuthenticated={user != null}
          emptyMessage={
            query.scope === 'following'
              ? 'フォロー中のユーザーの投稿はまだありません。「発見」から気になる人を探してみましょう。'
              : 'まだ投稿がありません。最初の1件を投稿してみましょう。'
          }
        />
      </div>

      <SuggestedTags tags={moodTags} />
    </div>
  )
}
