// S_ADMIN_OWNER_REVIEW: オーナー認証の個別レビュー
// 詳細: docs/design/screen-flow.md #6-カフェ経営者フロー / docs/architecture/routing.md
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getOwnerVerificationDetail,
  type OwnerVerificationDocument,
} from '@/app/_actions/admin-owner-verifications'
import { OwnerVerificationReviewActions } from '@/components/features/admin/owner-verification-review-actions'
import { OWNER_VERIFICATION_STATUS_LABELS } from '@/lib/constants/admin-owner-verifications'
import { OWNER_DOCUMENT_TYPES } from '@/lib/constants/owner'

export const metadata: Metadata = { title: 'オーナー認証レビュー' }

function documentTypeLabel(type: string): string {
  return OWNER_DOCUMENT_TYPES.find((item) => item.value === type)?.label ?? type
}

/** 署名付きURLのパス部分（クエリより前）の拡張子で画像/PDFを見分ける */
function isPdfDocument(viewUrl: string): boolean {
  const path = viewUrl.split('?')[0] ?? viewUrl
  return path.toLowerCase().endsWith('.pdf')
}

export default async function AdminOwnerVerificationReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getOwnerVerificationDetail(id)
  if (!result.ok) notFound()

  const { data: verification } = result

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <Link
        href="/admin/verifications"
        className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
      >
        ← オーナー認証審査
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">{verification.cafeName}</h1>
        <span className="text-sm text-muted-foreground">
          {OWNER_VERIFICATION_STATUS_LABELS[verification.status]} ・{' '}
          {new Date(verification.createdAt).toLocaleString('ja-JP')}
        </span>
      </header>

      <section className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4">
        <h2 className="text-base font-bold text-foreground">申請内容</h2>
        <dl className="flex flex-col gap-1 text-sm text-foreground">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">申請者</dt>
            <dd>
              {verification.applicant.displayName} (@{verification.applicant.username})
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">連絡先</dt>
            <dd>{verification.contactEmail}</dd>
          </div>
          {verification.applicantNote && (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">補足</dt>
              <dd className="whitespace-pre-wrap">{verification.applicantNote}</dd>
            </div>
          )}
          {verification.reviewNotes && (
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">審査メモ</dt>
              <dd className="whitespace-pre-wrap">{verification.reviewNotes}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4">
        <h2 className="text-base font-bold text-foreground">提出書類</h2>
        <ul className="flex flex-col gap-3">
          {verification.documents.map((document, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 書類に一意なIDが無く、順序も変わらない
            <li key={index}>
              <VerificationDocument document={document} />
            </li>
          ))}
        </ul>
      </section>

      {verification.status === 'pending' ? (
        <OwnerVerificationReviewActions verificationId={verification.id} />
      ) : (
        <p className="text-sm text-muted-foreground">この申請は既に対応済みです。</p>
      )}
    </div>
  )
}

function VerificationDocument({ document }: { document: OwnerVerificationDocument }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-foreground">{documentTypeLabel(document.type)}</span>
      {!document.viewUrl ? (
        <p className="text-sm text-muted-foreground">書類を表示できませんでした。</p>
      ) : isPdfDocument(document.viewUrl) ? (
        <a
          href={document.viewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          PDFを開く
        </a>
      ) : (
        <a
          href={document.viewUrl}
          target="_blank"
          rel="noreferrer"
          className="focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          <Image
            src={document.viewUrl}
            alt={`${documentTypeLabel(document.type)}のプレビュー`}
            width={320}
            height={240}
            unoptimized
            className="h-60 w-auto max-w-full rounded-lg border border-border-default object-contain"
          />
        </a>
      )}
    </div>
  )
}
