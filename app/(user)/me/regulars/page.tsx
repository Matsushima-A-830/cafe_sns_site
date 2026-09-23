// S_MYPAGE の「私の行きつけ」すべて見る
// 詳細: docs/design/wireframes/mypage.md#s_mypageマイページ / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { RegularCafeGrid } from '@/components/features/profiles/regular-cafe-grid'
import {
  getUserRegularCafeCount,
  getUserRegularCafes,
  REGULAR_CAFE_LIST_LIMIT,
} from '@/lib/profiles/regulars'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: '私の行きつけ' }

export default async function RegularCafesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // middleware が /me 配下の未ログインを弾くが、matcher の変更で無防備になるのを避ける
  if (!user) redirect('/login?next=%2Fme%2Fregulars')

  // 件数はマイページのプレビューと同じ関数から取る（entries.length で代用すると
  // REGULAR_CAFE_LIST_LIMIT で頭打ちになりズレる — lib/cafes/user-cafe-lists.ts と同じ理由）
  const [entries, total] = await Promise.all([
    getUserRegularCafes(supabase, user.id),
    getUserRegularCafeCount(supabase, user.id),
  ])

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
          私の行きつけ
          <span className="ml-2 text-base font-normal text-muted-foreground">{total}件</span>
        </h1>

        {/* ページ送りが無いので、打ち切ったことを黙らせない（cafe-list-page.tsx と同じ判断） */}
        {total > entries.length && (
          <p className="text-sm text-muted-foreground">
            認定日の新しい順に{REGULAR_CAFE_LIST_LIMIT}件までを表示しています。
          </p>
        )}
      </header>

      <RegularCafeGrid
        entries={entries}
        emptyMessage="まだ行きつけの認定はありません。カフェのオーナーに常連認定してもらうと、ここに並びます。"
      />
    </div>
  )
}
