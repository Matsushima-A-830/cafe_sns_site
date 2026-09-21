// S_REPORT_FORM: 通報フォーム
// 詳細: docs/design/wireframes/composer.md#s_report_form通報フォーム / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReportForm } from '@/components/features/reports/report-form'
import { getCafeDetail } from '@/lib/cafes/cafe-detail'
import { getCommentById } from '@/lib/posts/comments'
import { getPostDetail, postDisplayTitle } from '@/lib/posts/post-detail'
import { getProfileById } from '@/lib/profiles/public-profile'
import { createClient } from '@/lib/supabase/server'
import { createReportSchema } from '@/lib/validators/reports'

// middleware.ts の requiresAuth に /report が含まれるため、未ログインは自動的に
// /login?next=... へ送られる。ここでの redirect() は不要

type PageProps = { params: Promise<{ targetType: string; id: string }> }

const TARGET_TYPES = ['post', 'comment', 'user', 'cafe'] as const
type TargetType = (typeof TARGET_TYPES)[number]

function isTargetType(value: string): value is TargetType {
  return (TARGET_TYPES as readonly string[]).includes(value)
}

/**
 * target_id はポリモーフィックで FK が無いため、対象種別ごとに既存の取得関数で
 * 実在確認する（app/_actions/reports.ts createReport と同じ責務分担）
 *   docs/architecture/data-model/tables.md #reports
 */
async function loadTarget(targetType: TargetType, id: string) {
  const supabase = await createClient()

  switch (targetType) {
    case 'post': {
      const post = await getPostDetail(supabase, id)
      if (!post) return null
      return { label: postDisplayTitle(post.title, post.bodyJson), backHref: `/posts/${id}` }
    }
    case 'comment': {
      const comment = await getCommentById(supabase, id)
      if (!comment) return null
      const excerpt = comment.body.length > 40 ? `${comment.body.slice(0, 40)}…` : comment.body
      return { label: excerpt, backHref: `/posts/${comment.postId}` }
    }
    case 'user': {
      const profile = await getProfileById(supabase, id)
      if (!profile) return null
      return { label: profile.displayName, backHref: `/users/${profile.username}` }
    }
    case 'cafe': {
      const cafe = await getCafeDetail(supabase, id)
      if (!cafe) return null
      return { label: cafe.name, backHref: `/cafes/${id}` }
    }
  }
}

export const metadata: Metadata = { title: '通報する' }

export default async function ReportFormPage({ params }: PageProps) {
  const { targetType, id } = await params
  // 不正な形式のIDは PostgREST のエラー（22P02）になるため、DBに問い合わせる前に弾く
  // （getCafeDetail 以外の取得関数は形式チェックを持たないため、ここで一括して担う）
  if (!isTargetType(targetType) || !createReportSchema.shape.targetId.safeParse(id).success) {
    notFound()
  }

  const target = await loadTarget(targetType, id)
  if (!target) notFound()

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href={target.backHref}
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold text-foreground">通報する</h1>
      </header>

      <ReportForm
        targetType={targetType}
        targetId={id}
        targetLabel={target.label}
        backHref={target.backHref}
      />
    </div>
  )
}
