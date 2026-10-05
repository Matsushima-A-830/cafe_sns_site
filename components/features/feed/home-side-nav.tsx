import { Compass, House, MapPin, PencilLine, User } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/**
 * S_HOME（PC）の3カラム左側。タブレット（md）はアイコンレール、PC（lg）でラベルを出す。
 *
 * ワイヤーには通知・お気に入り・行きたい・下書き・設定も並ぶが、ルート自体が
 * 未実装なので置いていない（404 へのリンクを先に作らない — pending-items D27）。
 * 「地図」は feat/s-map で追加（未ログインでも見られる画面なので AUTHED_ITEMS ではなくこちら）。
 * 「マイ」は /me の実装に合わせて追加した（お気に入り・行きたい・下書きへは
 * マイページの4カードから辿れる）
 *   docs/design/wireframes/browsing.md #S_HOME PC
 */
const ITEMS = [
  { key: 'home', href: '/', label: 'ホーム', Icon: House },
  { key: 'explore', href: '/explore', label: '発見', Icon: Compass },
  { key: 'map', href: '/map', label: '地図', Icon: MapPin },
] as const

/** ログイン中だけ出す項目。未ログインで踏むと /login へ飛ぶだけなので並べない */
const AUTHED_ITEMS = [{ key: 'me', href: '/me', label: 'マイ', Icon: User }] as const

export function HomeSideNav({ current, isAuthed }: { current: string; isAuthed: boolean }) {
  return (
    <nav aria-label="メインナビゲーション" className="hidden w-16 shrink-0 md:block lg:w-48">
      <ul className="flex flex-col gap-2">
        {[...ITEMS, ...(isAuthed ? AUTHED_ITEMS : [])].map(({ key, href, label, Icon }) => (
          <li key={key}>
            <Link
              href={href}
              aria-current={key === current ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-full px-3 py-3 text-base transition-colors focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
                key === current
                  ? 'bg-terracotta-100 font-bold text-secondary'
                  : 'text-muted-foreground hover:bg-muted',
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
              className="flex items-center gap-3 rounded-full bg-primary px-3 py-3 text-base font-bold text-primary-foreground shadow-elevation-1 hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
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
