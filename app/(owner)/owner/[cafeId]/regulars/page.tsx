// S_OWNER_REGULARS: 常連認定管理
// 詳細: docs/design/wireframes/owner.md#s_owner_regulars常連認定管理 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getOwnedCafeSummary,
  getRegularCandidates,
  listRegularCustomers,
} from '@/lib/owner/regulars'
import { createClient } from '@/lib/supabase/server'
import { RegularsView } from './regulars-view'

// middleware.ts の isOwnerArea が role='owner'|'admin' をゲートするが、cafeId が
// 呼び出し元本人のカフェかまでは見ていない。getOwnedCafeSummary 側で verified_owner_id を
// 検証し、他人のカフェなら notFound() に落とす（S_OWNER_DASHBOARD と同じ落とし穴）

type PageProps = { params: Promise<{ cafeId: string }> }

export const metadata: Metadata = { title: '常連さん管理' }

export default async function OwnerRegularsPage({ params }: PageProps) {
  const { cafeId } = await params
  const supabase = await createClient()

  const cafe = await getOwnedCafeSummary(supabase, cafeId)
  if (!cafe) notFound()

  const [activeRegulars, candidates, history] = await Promise.all([
    listRegularCustomers(supabase, cafeId, { activeOnly: true }),
    getRegularCandidates(supabase, cafeId),
    listRegularCustomers(supabase, cafeId, { activeOnly: false }),
  ])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href={`/owner/${cafeId}`}
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold text-foreground">常連さん管理</h1>
        <p className="text-sm text-muted-foreground">現在の常連: {activeRegulars.length}名</p>
      </div>

      <RegularsView
        cafeId={cafeId}
        cafeName={cafe.name}
        initialActiveRegulars={activeRegulars}
        initialCandidates={candidates ?? []}
        initialHistory={history}
      />
    </div>
  )
}
