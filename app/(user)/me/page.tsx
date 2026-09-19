// S_MYPAGE: マイページ（自分のプロフィール + 各リストへの入り口）
// 詳細: docs/design/wireframes/mypage.md#s_mypageマイページ / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { listDrafts } from '@/app/_actions/drafts'
import { ListPreviewTabs, type PreviewLane } from '@/components/features/mypage/list-preview-tabs'
import {
  type ListShortcut,
  ListShortcuts,
  SHORTCUT_ICONS,
} from '@/components/features/mypage/list-shortcuts'
import { PostFeed } from '@/components/features/posts/post-feed'
import { ProfileAvatar } from '@/components/features/profiles/profile-avatar'
import { ProfileCountList } from '@/components/features/profiles/profile-count-list'
import { Button } from '@/components/ui/button'
import {
  CAFE_LIST_PREVIEW_LIMIT,
  type CafeListEntry,
  getUserCafeList,
  getUserCafeListCounts,
} from '@/lib/cafes/user-cafe-lists'
import { draftPostTypeLabel, draftPreviewText, draftResumeHref } from '@/lib/composer/draft-summary'
import { CAFE_LIST_LABELS, CAFE_LIST_PATHS } from '@/lib/constants/cafe-lists'
import { getPostList } from '@/lib/posts/post-list'
import { getProfileById, getProfileCounts } from '@/lib/profiles/public-profile'
import { createClient } from '@/lib/supabase/server'
import { formatPostDate } from '@/lib/utils/format-date'
import type { FeedQuery } from '@/lib/validators/feed'

// routing.md の指定どおり SSR。セッションが無いと成立しない画面なので ISR の検討余地は無い
export const metadata: Metadata = { title: 'マイページ' }

function previewItems(entries: CafeListEntry[]) {
  return entries.map((entry) => ({
    key: entry.cafeId,
    href: `/cafes/${entry.cafeId}`,
    primary: entry.name,
    secondary: entry.areaLabel ?? '',
  }))
}

export default async function MyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // middleware が未ログインを /login へ送るので通常は到達しない。matcher の変更で
  // 無防備になるのを避けるため、ページ側でも自前で閉じる
  if (!user) redirect('/login?next=%2Fme')

  const profile = await getProfileById(supabase, user.id)
  // status が active 以外（pending_consent / suspended / deleted）と profiles 行が
  // まだ無いケース。middleware がそれぞれ隔離・オンボーディングへ誘導している
  if (!profile) notFound()

  // 往復を直列にしない（CLAUDE.md パフォーマンス「N+1回避」）
  const [counts, listCounts, favorites, wantToGo, drafts, page] = await Promise.all([
    getProfileCounts(supabase, profile.id),
    getUserCafeListCounts(supabase),
    getUserCafeList(supabase, 'favorite', CAFE_LIST_PREVIEW_LIMIT),
    getUserCafeList(supabase, 'want_to_go', CAFE_LIST_PREVIEW_LIMIT),
    // 下書きは件数もここから数える。listDrafts が期限切れ除外と50件上限を担保している
    listDrafts(),
    getPostList(supabase, { authorId: profile.id, viewerId: user.id }),
  ])

  // 下書きだけは取得に失敗してもページ全体を落とさない（マイページの主役ではない）。
  // ただし握って0件にすると「下書きが消えた」ようにしか見えないので理由をログに残す
  if (!drafts.ok) console.error('[mypage] 下書き一覧の取得に失敗:', drafts.error)
  const draftList = drafts.ok ? drafts.data : []

  const shortcuts: ListShortcut[] = [
    {
      key: 'favorite',
      href: CAFE_LIST_PATHS.favorite,
      label: CAFE_LIST_LABELS.favorite,
      count: listCounts.favorite,
      Icon: SHORTCUT_ICONS.Heart,
    },
    {
      key: 'want_to_go',
      href: CAFE_LIST_PATHS.want_to_go,
      label: CAFE_LIST_LABELS.want_to_go,
      count: listCounts.want_to_go,
      Icon: SHORTCUT_ICONS.MapPin,
    },
    {
      key: 'drafts',
      href: '/me/drafts',
      label: '下書き',
      count: draftList.length,
      Icon: SHORTCUT_ICONS.FileText,
    },
  ]

  const lanes: PreviewLane[] = [
    {
      key: 'favorite',
      label: CAFE_LIST_LABELS.favorite,
      href: CAFE_LIST_PATHS.favorite,
      items: previewItems(favorites),
      emptyMessage: 'お気に入りのカフェはまだありません。カフェのページから追加できます。',
    },
    {
      key: 'want_to_go',
      label: CAFE_LIST_LABELS.want_to_go,
      href: CAFE_LIST_PATHS.want_to_go,
      items: previewItems(wantToGo),
      emptyMessage: '「行きたい」のカフェはまだありません。カフェのページから追加できます。',
    },
    {
      key: 'drafts',
      label: '下書き',
      href: '/me/drafts',
      // 再開できない（payload のバージョン不一致）下書きも件数バッジと S_DRAFTS には
      // 出るので、ここでも隠さない。除くと「下書き 2」の隣に「下書きはありません」が並ぶ。
      // 再開先が無いぶん遷移先は一覧（削除はそこから行う）
      items: draftList.slice(0, CAFE_LIST_PREVIEW_LIMIT).map((draft) => ({
        key: draft.clientDraftKey,
        href: draft.stale ? '/me/drafts' : draftResumeHref(draft),
        primary: draft.stale ? '古い形式の下書き（再開できません）' : draftPreviewText(draft),
        secondary: draft.stale
          ? formatPostDate(draft.lastSavedAt)
          : `${draftPostTypeLabel(draft)} ・ ${formatPostDate(draft.lastSavedAt)}`,
      })),
      emptyMessage: '下書きはありません。書きかけの投稿は自動保存され、ここに並びます。',
    },
  ]

  // バッジ（user_badges）・「私の行きつけ」（regular_customers）・「保存投稿」（post_bookmarks）・
  // 制覇マップ（area_visits）・プロフィール編集（/me/edit）は元テーブル・ルートが
  // 未整備のため出していない — pending-items D32
  const query: FeedQuery = {
    scope: 'new',
    tagSlug: null,
    areaCode: null,
    authorUsername: profile.username,
    cafeId: null,
  }

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

        {/* 他人から見た自分の見え方を確認する導線（プロフィール編集は未実装） */}
        <Button asChild variant="outline" size="lg">
          <Link href={`/users/${profile.username}`}>公開プロフィールを見る</Link>
        </Button>
      </header>

      <ListShortcuts shortcuts={shortcuts} />

      <ListPreviewTabs lanes={lanes} />

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-foreground">自分の投稿</h2>
        <PostFeed
          initialPage={page}
          query={query}
          isAuthenticated={user != null}
          emptyMessage="まだ投稿がありません。最初の1件を投稿してみましょう。"
        />
      </section>
    </div>
  )
}
