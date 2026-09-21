// S_ADMIN_REVIEW: 通報の個別レビュー
// 詳細: docs/design/screen-flow.md #5-通報ブロックフロー / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getReportDetail } from '@/app/_actions/admin-reports'
import { ReportReviewActions } from '@/components/features/admin/report-review-actions'
import type { ReportTargetSummary } from '@/lib/admin/report-target'
import { REPORT_STATUS_LABELS, REPORT_TARGET_TYPE_LABELS } from '@/lib/constants/admin-reports'
import { REPORT_REASONS } from '@/lib/constants/reports'

export const metadata: Metadata = { title: '通報レビュー' }

function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((item) => item.value === reason)?.label ?? reason
}

export default async function AdminReportReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getReportDetail(id)
  if (!result.ok) notFound()

  const { data: report } = result

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <Link
        href="/admin/reports"
        className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
      >
        ← 通報キュー
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">
          {REPORT_TARGET_TYPE_LABELS[report.targetType]}への通報
        </h1>
        <span className="text-sm text-muted-foreground">
          {REPORT_STATUS_LABELS[report.status]} ・{' '}
          {new Date(report.createdAt).toLocaleString('ja-JP')}
        </span>
      </header>

      <section className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4">
        <h2 className="text-base font-bold text-foreground">通報内容</h2>
        <dl className="flex flex-col gap-1 text-sm text-foreground">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">理由</dt>
            <dd>{reasonLabel(report.reason)}</dd>
          </div>
          {report.description && (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">補足説明</dt>
              <dd className="whitespace-pre-wrap">{report.description}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-muted-foreground">通報者</dt>
            <dd>
              {report.reporter.displayName} (@{report.reporter.username})
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4">
        <h2 className="text-base font-bold text-foreground">対象の内容</h2>
        <ReportTargetContent target={report.target} />
      </section>

      {report.status === 'pending' || report.status === 'reviewing' ? (
        <ReportReviewActions reportId={report.id} targetType={report.targetType} />
      ) : (
        <p className="text-sm text-muted-foreground">この通報は既に対応済みです。</p>
      )}
    </div>
  )
}

/**
 * 対象が既に削除・停止済みでも管理者向けに内容を出す（getReportTargetSummary が
 * 一般ユーザー向けフィルタを掛けずに読んでいるため）。実在しない場合のみ null
 */
function ReportTargetContent({ target }: { target: ReportTargetSummary | null }) {
  if (!target) {
    return <p className="text-sm text-muted-foreground">対象は既に削除され存在しません。</p>
  }

  switch (target.type) {
    case 'post':
      return (
        <div className="flex flex-col gap-1 text-sm text-foreground">
          <span className="text-muted-foreground">
            投稿者: {target.author.displayName} (@{target.author.username}) ・ status={' '}
            {target.status}
            {target.deletedAt && '（削除済み）'}
          </span>
          <p className="whitespace-pre-wrap">{target.bodyPreview || '（本文なし）'}</p>
        </div>
      )
    case 'comment':
      return (
        <div className="flex flex-col gap-1 text-sm text-foreground">
          <span className="text-muted-foreground">
            投稿者: {target.author.displayName} (@{target.author.username})
            {target.deletedAt && '（削除済み）'}
          </span>
          <p className="whitespace-pre-wrap">{target.body}</p>
        </div>
      )
    case 'user':
      return (
        <p className="text-sm text-foreground">
          {target.displayName} (@{target.username}) ・ status={target.status}
        </p>
      )
    case 'cafe':
      return (
        <p className="text-sm text-foreground">
          {target.name} ・ status={target.status}
        </p>
      )
  }
}
