import { Compass, House, PencilLine } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/**
 * S_HOME（PC）の3カラム左側。タブレット（md）はアイコンレール、PC（lg）でラベルを出す。
 *
 * ワイヤーには地図・通知・マイ・お気に入り・行きたい・下書き・設定も並ぶが、
 * ルート自体が未実装なので置いていない（404 へのリンクを先に作らない — pending-items D27）
 *   docs/design/wireframes/browsing.md #S_HOME PC
 */
const ITEMS = [
  { key: 'home', href: '/', label: 'ホーム', Icon: House },
  { key: 'explore', href: '/explore', label: '発見', Icon: Compass },
] as const

export function HomeSideNav({ current, isAuthed }: { current: string; isAuthed: boolean }) {
  return (
    <nav aria-label="メインナビゲーション" className="hidden w-16 shrink-0 md:block lg:w-48">
      <ul className="flex flex-col gap-2">
        {ITEMS.map(({ key, href, label, Icon }) => (
          <li key={key}>
            <Link
              href={href}
              aria-current={key === current ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-3 text-base hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
                key === current ? 'font-bold text-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon aria-hidden="true" className="size-6 shrink-0" />
              {/* アイコンレール時もスクリーンリーダーには名前が要る */}
              <span className="sr-only lg:not-sr-only">{label}</span>
            </Link>
          </li>
        ))}
        {isAuthed && (
          <li>
            <Link
              href="/new"
              className="flex items-center gap-3 rounded-md bg-primary px-3 py-3 text-base font-bold text-primary-foreground hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              <PencilLine aria-hidden="true" className="size-6 shrink-0" />
              <span className="sr-only lg:not-sr-only">投稿する</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )
}
