import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CafeListView } from '@/components/features/cafes/cafe-list-view'
import {
  CAFE_LIST_LIMIT,
  getUserCafeList,
  getUserCafeListCounts,
} from '@/lib/cafes/user-cafe-lists'
import { CAFE_LIST_LABELS, CAFE_LIST_PATHS, type CafeListType } from '@/lib/constants/cafe-lists'
import { createClient } from '@/lib/supabase/server'

/**
 * S_FAVORITES / S_WANT_TO_GO の中身。データソース（list_type）以外は同じ画面なので
 * ページ側は Metadata と list_type だけを持つ
 *   docs/design/wireframes/mypage.md #S_FAVORITES--S_WANT_TO_GO--S_BOOKMARKS
 */
export async function CafeListPage({ listType }: { listType: CafeListType }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // middleware が /me 配下の未ログインを弾くが、matcher の変更で無防備になるのを避ける
  // profiles 行の有無は見ない。user_cafe_lists.user_id が profiles への FK なので、
  // 行が無いユーザーはそもそもリストを1件も持てない
  if (!user) redirect(`/login?next=${encodeURIComponent(CAFE_LIST_PATHS[listType])}`)

  // 件数はマイページの4カードと同じ関数から取る。entries.length で代用すると
  // CAFE_LIST_LIMIT で頭打ちになり、「カードは137、開くと100件」とズレる
  const [entries, counts] = await Promise.all([
    getUserCafeList(supabase, listType),
    getUserCafeListCounts(supabase),
  ])
  const label = CAFE_LIST_LABELS[listType]
  const total = counts[listType]

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/me"
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← マイページ
        </Link>
        <h1 className="text-2xl font-bold text-foreground">
          {label}のカフェ
          <span className="ml-2 text-base font-normal text-muted-foreground">{total}件</span>
        </h1>

        {/* ページ送りが無いので、打ち切ったことを黙らせない（pending-items D32） */}
        {total > entries.length && (
          <p className="text-sm text-muted-foreground">
            新しい順に{CAFE_LIST_LIMIT}件までを表示しています。
          </p>
        )}
      </header>

      {/* 並び替え・表示切替（ワイヤー上部）と地図（PC 右カラム）は出していない
          — pending-items D32 */}
      <CafeListView listType={listType} initialEntries={entries} />
    </div>
  )
}
