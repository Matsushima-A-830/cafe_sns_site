import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

export type FeedTab = { key: string; label: string; href: string }

/**
 * フィードのタブ（発見 / フォロー中、おすすめ / 新着）。状態を URL に持たせて
 * サーバーで描画する。クライアント状態にすると認証状態ごとの出し分けと
 * ディープリンク（S_EXPLORE は直接表示画面として定義されている）が二重管理になる
 *   docs/design/wireframes/browsing.md #S_HOME #S_EXPLORE
 */
export function FeedTabs({
  label,
  tabs,
  currentKey,
}: {
  label: string
  tabs: FeedTab[]
  currentKey: string
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex gap-6 border-b border-border-default">
        {tabs.map((tab) => {
          const isCurrent = tab.key === currentKey
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-block border-b-2 px-2 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
                  isCurrent
                    ? 'border-primary font-bold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
