// S_OWNER_CAFE_EDIT: 店舗情報編集
// 詳細: docs/design/wireframes/owner.md#s_owner_cafe_edit店舗情報編集 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOwnedCafeForEdit } from '@/lib/owner/cafe-edit'
import { createClient } from '@/lib/supabase/server'
import { CafeEditForm } from './cafe-edit-form'

// middleware.ts の isOwnerArea が role='owner'|'admin' をゲートするが、cafeId が
// 呼び出し元本人のカフェかまでは見ていない。getOwnedCafeForEdit 側で verified_owner_id を
// 検証し、他人のカフェなら notFound() に落とす（S_OWNER_DASHBOARD と同じ落とし穴）

type PageProps = { params: Promise<{ cafeId: string }> }

export const metadata: Metadata = { title: '店舗情報編集' }

export default async function CafeEditPage({ params }: PageProps) {
  const { cafeId } = await params
  const supabase = await createClient()

  const [cafe, areasResult] = await Promise.all([
    getOwnedCafeForEdit(supabase, cafeId),
    supabase.from('areas').select('code, label').eq('level', 'ward').order('priority', {
      ascending: false,
    }),
  ])
  if (!cafe) notFound()

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href={`/owner/${cafeId}`}
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold text-foreground">店舗情報編集</h1>
      </div>
      <CafeEditForm cafe={cafe} areas={areasResult.data ?? []} />
    </div>
  )
}
