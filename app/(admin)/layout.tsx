import type { ReactNode } from 'react'

/**
 * 運営管理シェル。role='admin' 以外は middleware.ts が /not-found へ rewrite 済み
 *   docs/architecture/routing.md #admin
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border-default bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <span className="text-sm font-bold text-muted-foreground">運営管理</span>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
