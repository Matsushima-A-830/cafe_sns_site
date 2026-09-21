// オーナー認証審査キュー: /admin/verifications
// 詳細: docs/design/screen-flow.md #6-カフェ経営者フロー / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  listOwnerVerifications,
  type OwnerVerificationStatus,
} from '@/app/_actions/admin-owner-verifications'
import { OWNER_VERIFICATION_STATUS_LABELS } from '@/lib/constants/admin-owner-verifications'

export const metadata: Metadata = { title: 'オーナー認証審査' }

const STATUS_TABS: OwnerVerificationStatus[] = ['pending', 'approved', 'rejected', 'withdrawn']

function isOwnerVerificationStatus(value: string): value is OwnerVerificationStatus {
  return (STATUS_TABS as string[]).includes(value)
}

export default async function AdminOwnerVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: statusParam } = await searchParams
  const status: OwnerVerificationStatus =
    statusParam && isOwnerVerificationStatus(statusParam) ? statusParam : 'pending'

  const result = await listOwnerVerifications(status)
  if (!result.ok) {
    // middleware が role='admin' 以外を /not-found へ rewrite 済みなので、ここに来て
    // FORBIDDEN/UNAUTHENTICATED になるのは想定外（JWTが更新前など）。詳細を隠さず404にする
    notFound()
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">
          オーナー認証審査
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {result.data.length}件
          </span>
        </h1>
      </header>

      <nav className="flex gap-2" aria-label="ステータスで絞り込み">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/admin/verifications?status=${tab}`}
            className={`rounded-full px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none ${
              tab === status
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface text-muted-foreground hover:bg-muted'
            }`}
            aria-current={tab === status ? 'page' : undefined}
          >
            {OWNER_VERIFICATION_STATUS_LABELS[tab]}
          </Link>
        ))}
      </nav>

      {result.data.length === 0 ? (
        <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
          該当する申請はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.data.map((verification) => (
            <li key={verification.id}>
              <Link
                href={`/admin/verifications/${verification.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border-default bg-surface p-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-base font-bold text-foreground">
                    {verification.cafeName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(verification.createdAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <span className="text-sm text-link">詳細</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
