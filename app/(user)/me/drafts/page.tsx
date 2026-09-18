// S_DRAFTS: 下書き一覧
// 詳細: docs/design/wireframes/mypage.md#s_drafts下書き一覧 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listDrafts } from '@/app/_actions/drafts'
import { DraftList } from '@/components/features/drafts/draft-list'

export const metadata: Metadata = { title: '下書き' }

export default async function DraftsPage() {
  // 期限切れ除外と50件上限は listDrafts が担保している。マイページ用に別のクエリを書かない
  const result = await listDrafts()
  if (!result.ok) {
    // 失敗を一括で /login に送ると、DB 側の一時的な失敗でもログイン画面に飛ばされ、
    // middleware がログイン済みを即 /me に戻すため「何も起きずマイページに戻る」ことになる。
    // 下書きが読めていないことがユーザーにも我々にも伝わらないので、原因ごとに分ける
    if (result.error !== 'UNAUTHENTICATED') {
      throw new Error(`下書き一覧の取得に失敗しました: ${result.error}`)
    }
    redirect('/login?next=%2Fme%2Fdrafts')
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/me"
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← マイページ
        </Link>
        <h1 className="text-2xl font-bold text-foreground">
          下書き
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {result.data.length}件
          </span>
        </h1>
      </header>

      <DraftList initialDrafts={result.data} />
    </div>
  )
}
