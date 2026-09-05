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

  // 解決するまでの間、高さの確定した骨組みを描画してポップイン（CLS）を防ぐ
  if (isAuthed === null) {
    return <div aria-hidden="true" className="h-8 w-24 animate-pulse rounded-md bg-muted" />
  }

  if (isAuthed) {
    return (
      <form action={logOut}>
        <Button type="submit" variant="ghost" size="sm">
          ログアウト
        </Button>
      </form>
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
