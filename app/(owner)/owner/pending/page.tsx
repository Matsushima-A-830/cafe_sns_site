// S_OWNER_PENDING: オーナー認証審査中
// 詳細: docs/design/wireframes/owner.md#s_owner_pending審査中 / docs/architecture/routing.md
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { OwnerPendingView } from '@/components/features/owner/owner-pending-view'
import { getLatestOwnerVerification } from '@/lib/owner/verification'
import { createClient } from '@/lib/supabase/server'

// middleware.ts の requiresAuth に /owner/pending が含まれるため、未ログインは自動的に
// /login?next=... へ送られる。ここでの redirect() は不要

export const metadata: Metadata = { title: '審査中' }

export default async function OwnerPendingPage() {
  const supabase = await createClient()
  const verification = await getLatestOwnerVerification(supabase)
  // 一度も申請していないユーザーがURLを直叩きしたケース
  if (!verification) notFound()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <OwnerPendingView verification={verification} />
    </div>
  )
}
