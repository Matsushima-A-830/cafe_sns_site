// S_BADGES: バッジ・制覇マップ
// 詳細: docs/design/wireframes/mypage.md#s_badges / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BadgeGrid } from '@/components/features/badges/badge-grid'
import { BadgeMapTabs } from '@/components/features/badges/badge-map-tabs'
import { ConquestMapPanel } from '@/components/features/badges/conquest-map-panel'
import { getConquestMapProgress } from '@/lib/badges/conquest-map'
import { getAllBadgeProgress } from '@/lib/badges/progress'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'バッジ・制覇マップ' }

export default async function BadgesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // middleware が /me 配下の未ログインを弾くが、matcher の変更で無防備になるのを避ける
  if (!user) redirect('/login?next=%2Fme%2Fbadges')

  const [badgeProgress, mapProgress] = await Promise.all([
    getAllBadgeProgress(supabase, user.id),
    getConquestMapProgress(supabase, user.id),
  ])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/me"
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← マイページ
        </Link>
        <h1 className="text-2xl font-bold text-foreground">バッジ・制覇マップ</h1>
      </header>

      <BadgeMapTabs
        badgesPanel={<BadgeGrid progress={badgeProgress} />}
        mapPanel={<ConquestMapPanel progress={mapProgress} />}
      />
    </div>
  )
}
