import Link from 'next/link'

/**
 * ログインユーザー向けのシェル。投稿導線（/new）は集中してもらいたいので、
 * 閲覧系（(browsing)）のようなグローバルナビは置かず最小構成にする
 *   docs/architecture/routing.md
 */
export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <main className="flex-1">{children}</main>
      <footer className="border-t border-default bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          <Link href="/" className="text-link hover:underline">
            ホームに戻る
          </Link>
        </div>
      </footer>
    </div>
  )
}
