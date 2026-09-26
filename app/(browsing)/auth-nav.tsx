'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { logOut } from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/browser'

/**
 * 認証状態はクライアント側で取得する。(browsing) レイアウトで getUser() を
 * サーバー側に置くと配下の全ページ（ホーム・カフェ詳細・投稿詳細）が動的レンダリングに
 * 固定され、CLAUDE.md が求める SSG/ISR が効かなくなるため。
 *
 * ここはナビの見た目を出し分けるだけの表示用途（実際の認可は RLS / middleware が担う）
 * なので、getUser()（Auth サーバーへの通信）ではなく getSession()（ローカルの Cookie を
 * 読むだけ）を使う。初期表示までの遅延が短くなり、CLS も小さくなる
 */
export function AuthNav() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setIsAuthed(data.session != null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setIsAuthed(session != null))

    return () => subscription.unsubscribe()
  }, [])

  // 解決するまでの間、高さと横幅の確定した骨組みを描画してポップイン（CLS・兄弟要素の横ずれ）を防ぐ。
  // 未ログイン状態（テキスト + ボタンの2要素）に近い幅で2つ並べておく
  if (isAuthed === null) {
    return (
      <>
        <div
          aria-hidden="true"
          className="h-4 w-20 animate-pulse rounded motion-reduce:animate-none bg-muted"
        />
        <div
          aria-hidden="true"
          className="h-8 w-16 animate-pulse rounded-md motion-reduce:animate-none bg-muted"
        />
      </>
    )
  }

  if (isAuthed) {
    return (
      <>
        {/* モバイルは BottomNav の「マイ」でカバーされるため hidden md:inline。
            HomeSideNav は / と /explore にしか無いため、md 以上はこのリンクが
            /cafes/[id] 等それ以外のページから /me へ辿る唯一の導線として残す（pending-items D27） */}
        <Link
          href="/me"
          // 表記はサイドナビと揃えて「マイ」
          aria-label="マイページ"
          className="hidden whitespace-nowrap text-link underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none md:inline"
        >
          マイ
        </Link>
        <Button asChild size="sm">
          <Link href="/new">＋ 投稿する</Link>
        </Button>
        <form action={logOut}>
          <Button type="submit" variant="ghost" size="sm">
            ログアウト
          </Button>
        </form>
      </>
    )
  }

  return (
    <>
      <span>未ログイン</span>
      <Button asChild size="sm">
        <Link href="/login">ログイン</Link>
      </Button>
    </>
  )
}
