// S_OWNER_CLAIM: オーナー認証申請
// 詳細: docs/design/wireframes/owner.md#s_owner_claimオーナー認証申請 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { OwnerClaimForm } from '@/components/features/owner/owner-claim-form'
import { getCafeDetail } from '@/lib/cafes/cafe-detail'
import { getOwnerVerificationForCafe } from '@/lib/owner/verification'
import { createClient } from '@/lib/supabase/server'

// middleware.ts の requiresAuth に /owner/claim が含まれるため、未ログインは自動的に
// /login?next=... へ送られる。ここでの redirect() は不要

type PageProps = { params: Promise<{ cafeId: string }> }

export const metadata: Metadata = { title: 'オーナー認証申請' }

export default async function OwnerClaimPage({ params }: PageProps) {
  const { cafeId } = await params
  const supabase = await createClient()

  // 依存関係のない2つの読み取りを直列にしない（CLAUDE.md パフォーマンス「N+1回避」）
  const [cafe, existing] = await Promise.all([
    getCafeDetail(supabase, cafeId),
    getOwnerVerificationForCafe(supabase, cafeId),
  ])
  if (!cafe) notFound()
  // 既に別ユーザーが認証済み。DBトリガー（guard_cafe_owner_verifications_cafe_claimed）と
  // 同じ判定をページ側でも先にかけ、無駄な入力をさせない
  if (cafe.isVerified) redirect(`/cafes/${cafeId}`)

  // 審査中の申請が既にあるなら、そちらへ誘導する（VERIFICATION_ALREADY_PENDING を
  // フォーム送信で踏ませるのではなく、入力前に気づかせる）
  if (existing?.status === 'pending') redirect('/owner/pending')

  // reviewNotes が空でも「却下履歴がある」こと自体は伝える（S_OWNER_PENDING と表示を揃える）
  const rejectedReason =
    existing?.status === 'rejected' ? (existing.reviewNotes ?? '（理由の記載なし）') : null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href={`/cafes/${cafeId}`}
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold text-foreground">オーナー認証申請</h1>
      </header>

      <OwnerClaimForm cafeId={cafeId} cafeName={cafe.name} rejectedReason={rejectedReason} />
    </div>
  )
}
