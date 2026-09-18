import { ChevronRight, FileText, Heart, MapPin } from 'lucide-react'
import Link from 'next/link'

/**
 * マイページ上部のショートカットカード。件数バッジ付きで各一覧への入り口になる
 * （ワイヤーの4カード。「保存投稿」は post_bookmarks が未作成のため出していない
 *  — pending-items D32）
 *   docs/design/wireframes/mypage.md #S_MYPAGE
 */

export type ListShortcut = {
  key: string
  href: string
  label: string
  count: number
  Icon: typeof Heart
}

export const SHORTCUT_ICONS = { Heart, MapPin, FileText } as const

export function ListShortcuts({ shortcuts }: { shortcuts: ListShortcut[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">リスト</h2>

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {shortcuts.map(({ key, href, label, count, Icon }) => (
          <li key={key}>
            <Link
              href={href}
              // 数字だけを読み上げさせない。視覚的には「42」と大きく出しつつ、
              // 支援技術には「お気に入り 42件」と伝える
              aria-label={`${label} ${count}件`}
              className="flex h-full items-center gap-3 rounded-lg border border-border-default bg-surface p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              <Icon aria-hidden="true" className="size-6 shrink-0 text-primary" />
              <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm text-muted-foreground">{label}</span>
                <span className="text-xl font-bold text-foreground">{count}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
