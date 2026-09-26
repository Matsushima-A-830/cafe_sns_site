'use client'

import { Compass, House, LogIn, MapPin, PencilLine, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils/cn'

/**
 * モバイル専用のボトムナビ（README.md #モバイル-ボトムナビ）。md 以上はサイドナビで
 * 代替するため隠す（README.md 202行目の方針通り）。ずっと「まだ無い」と
 * pending-items D27 に書かれていたもの。S_MAP 実装でようやく置ける
 * （地図ルートが無い間はサイドナビにも出していなかった）
 *
 * 認証状態は AuthNav と同じ理由でクライアント側 getSession() を使う
 * （layout 全体をサーバー側で動的化しないため）
 */
const AUTHED_ITEMS = [
  { href: '/', label: 'ホーム', Icon: House, emphasize: false },
  { href: '/explore', label: '発見', Icon: Compass, emphasize: false },
  { href: '/new', label: '投稿', Icon: PencilLine, emphasize: true },
  { href: '/map', label: '地図', Icon: MapPin, emphasize: false },
  { href: '/me', label: 'マイ', Icon: User, emphasize: false },
] as const

const GUEST_ITEMS = [
  { href: '/', label: 'ホーム', Icon: House, emphasize: false },
  { href: '/explore', label: '発見', Icon: Compass, emphasize: false },
  { href: '/map', label: '地図', Icon: MapPin, emphasize: false },
  { href: '/login', label: 'ログイン', Icon: LogIn, emphasize: false },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setIsAuthed(data.session != null))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setIsAuthed(session != null))

    return () => subscription.unsubscribe()
  }, [])

  // 解決するまでは何も出さない。ログイン中/未ログインでボタン数が違うため、
  // 骨組みでの当て推量はガタつきの方が目立つ（AuthNav とは判断が異なる点）
  if (isAuthed === null) return null

  const items = isAuthed ? AUTHED_ITEMS : GUEST_ITEMS

  return (
    <nav
      aria-label="モバイルナビゲーション"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border-default bg-surface md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, Icon, emphasize }) => {
          const isCurrent = href === '/' ? pathname === '/' : pathname.startsWith(href)

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 border-t-2 px-2 py-2 text-xs',
                  'focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
                  isCurrent
                    ? 'border-primary font-bold text-foreground'
                    : 'border-transparent text-muted-foreground',
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn('size-6', emphasize && 'size-8 text-primary')}
                />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
