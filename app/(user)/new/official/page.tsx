// S_POST_OFFICIAL: 公式投稿フォーマット選択（幹C-2）
// 詳細: docs/design/wireframes/composer.md#s_post_officialオーナー限定投稿 / docs/architecture/routing.md
import { ClockIcon, CoffeeIcon, NotebookPenIcon, SparklesIcon } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OFFICIAL_FORMAT_LABELS } from '@/lib/constants/posts'
import { getOwnedCafe } from '@/lib/owner/dashboard'
import { createClient } from '@/lib/supabase/server'

// middleware.ts の isOwnerArea が role='owner'|'admin' をゲートするが、実際に
// verified_owner_id を持つカフェがあるかまでは見ていない（S_OWNER_DASHBOARD と同じ落とし穴）。
// getOwnedCafe で本人所有カフェを確認し、無ければ 404 に落とす

const FORMATS = [
  {
    format: 'today_special' as const,
    href: '/new/official/today-special',
    icon: CoffeeIcon,
    description: '日替わりメニュー・限定品',
  },
  {
    format: 'tip' as const,
    href: '/new/official/tip',
    icon: NotebookPenIcon,
    description: '店主から常連さんへの一言',
  },
  {
    format: 'closure' as const,
    href: '/new/official/closure',
    icon: ClockIcon,
    description: '予定変更のお知らせ',
  },
  {
    format: 'new_menu' as const,
    href: '/new/official/new-menu',
    icon: SparklesIcon,
    description: '新しいメニューの告知',
  },
]

export default async function NewOfficialPostPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const cafe = await getOwnedCafe(supabase, user.id)
  if (!cafe) notFound()

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <Link
          href={`/owner/${cafe.id}`}
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← 戻る
        </Link>
        <h1 className="text-xl font-bold text-foreground">{cafe.name} 公式投稿</h1>
      </header>

      <p className="text-base text-foreground">どんな公式投稿ですか？</p>

      <ul className="flex flex-col gap-3">
        {FORMATS.map(({ format, href, icon: Icon, description }) => (
          <li key={format}>
            <Link
              href={href}
              className="flex items-center gap-4 rounded-lg border border-border-default bg-surface p-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" />
              <span className="flex flex-col">
                <span className="text-base font-bold text-foreground">
                  {OFFICIAL_FORMAT_LABELS[format]}
                </span>
                <span className="text-sm text-muted-foreground">{description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href={`/owner/${cafe.id}`}
        className="self-center text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
      >
        キャンセル
      </Link>
    </div>
  )
}
