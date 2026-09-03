export default function BrowsingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-default bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="text-xl font-bold text-foreground">カフェSNS</div>
          <nav className="text-sm text-muted-foreground">未ログイン</nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-default bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          © 2026 カフェSNS
        </div>
      </footer>
    </div>
  )
}
