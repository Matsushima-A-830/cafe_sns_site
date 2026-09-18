import { AuthNav } from './auth-nav'

export default function BrowsingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border-default bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="text-xl font-bold whitespace-nowrap text-foreground">カフェSNS</div>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <AuthNav />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border-default bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          © 2026 カフェSNS
        </div>
      </footer>
    </div>
  )
}
