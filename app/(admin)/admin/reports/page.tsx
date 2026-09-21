// S_ADMIN_REPORTS: 通報キュー
// 詳細: docs/design/screen-flow.md #5-通報ブロックフロー / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listReports, type ReportStatus } from '@/app/_actions/admin-reports'
import { REPORT_STATUS_LABELS, REPORT_TARGET_TYPE_LABELS } from '@/lib/constants/admin-reports'
import { REPORT_REASONS } from '@/lib/constants/reports'

export const metadata: Metadata = { title: '通報キュー' }

const STATUS_TABS: ReportStatus[] = ['pending', 'reviewing', 'resolved', 'rejected']

function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((item) => item.value === reason)?.label ?? reason
}

function isReportStatus(value: string): value is ReportStatus {
  return (STATUS_TABS as string[]).includes(value)
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: statusParam } = await searchParams
  const status: ReportStatus = statusParam && isReportStatus(statusParam) ? statusParam : 'pending'

  const result = await listReports(status)
  if (!result.ok) {
    // middleware が role='admin' 以外を /not-found へ rewrite 済みなので、ここに来て
    // FORBIDDEN/UNAUTHENTICATED になるのは想定外（JWTが更新前など）。詳細を隠さず404にする
    notFound()
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">
          通報キュー
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {result.data.length}件
          </span>
        </h1>
      </header>

      <nav className="flex gap-2" aria-label="ステータスで絞り込み">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/admin/reports?status=${tab}`}
            className={`rounded-full px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none ${
              tab === status
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface text-muted-foreground hover:bg-muted'
            }`}
            aria-current={tab === status ? 'page' : undefined}
          >
            {REPORT_STATUS_LABELS[tab]}
          </Link>
        ))}
      </nav>

      {result.data.length === 0 ? (
        <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
          該当する通報はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.data.map((report) => (
            <li key={report.id}>
              <Link
                href={`/admin/reports/${report.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border-default bg-surface p-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-base font-bold text-foreground">
                    {REPORT_TARGET_TYPE_LABELS[report.targetType]} / {reasonLabel(report.reason)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(report.createdAt).toLocaleString('ja-JP')}
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
