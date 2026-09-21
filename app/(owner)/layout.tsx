import Link from 'next/link'

/**
 * 経営者エリアの最小シェル。専用サイドナビ・カフェ選択ドロップダウンは
 * S_OWNER_DASHBOARD 実装時に追加する（routing.md #app(owner)layouttsx）。
 * 今回追加する claim/pending は認証申請フローのみなので (user) と同じ最小構成にする
 */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border-default bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          <Link href="/" className="text-link hover:underline">
            ホームに戻る
          </Link>
        </div>
      </footer>
    </div>
  )
}
