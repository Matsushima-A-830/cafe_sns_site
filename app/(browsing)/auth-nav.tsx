'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { logOut } from '@/app/_actions/auth'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/browser'

/**
 * 認証状態はクライアント側で取得する。(browsing) レイアウトで getUser() を
 * サーバー側に置くと配下の全ページ（ホーム・カフェ詳細・投稿詳細）が動的レンダリングに
 * 固定され、CLAUDE.md が求める SSG/ISR が効かなくなるため
 */
export function AuthNav() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setIsAuthed(data.user != null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setIsAuthed(session != null))

    return () => subscription.unsubscribe()
  }, [])

  if (isAuthed === null) return null

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
