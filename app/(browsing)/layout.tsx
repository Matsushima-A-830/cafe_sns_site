import Link from 'next/link'
import { BottomNav } from '@/components/features/feed/bottom-nav'
import { AuthNav } from './auth-nav'

export default function BrowsingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border-default bg-surface/90 shadow-elevation-1 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="font-heading text-xl font-bold whitespace-nowrap text-primary">
            ミツカフェ
          </div>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <AuthNav />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border-default bg-surface">
        {/* pb-16(64px): モバイルのみ固定表示するボトムナビの高さぶん、footer末尾（リンク）が隠れないよう空ける */}
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pt-6 pb-16 text-sm text-muted-foreground md:pb-6">
          <nav className="flex items-center gap-4">
            <Link href="/terms" className="text-link hover:text-link-hover hover:underline">
              利用規約
            </Link>
            <Link href="/privacy" className="text-link hover:text-link-hover hover:underline">
              プライバシーポリシー
            </Link>
          </nav>
          <p>© 2026 ミツカフェ</p>
        </div>
      </footer>
      <BottomNav />
    </div>
  )
}
