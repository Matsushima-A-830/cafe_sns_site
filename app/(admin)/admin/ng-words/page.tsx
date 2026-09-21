// S_ADMIN_NG_WORDS: NGワード管理
// 詳細: docs/architecture/data-model/tables.md #ng_words / docs/architecture/routing.md
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listNgWords } from '@/app/_actions/admin-ng-words'
import { NgWordManager } from '@/components/features/admin/ng-word-manager'

export const metadata: Metadata = { title: 'NGワード管理' }

export default async function AdminNgWordsPage() {
  const result = await listNgWords()
  if (!result.ok) {
    // middleware が role='admin' 以外を /not-found へ rewrite 済みなので、ここに来て
    // FORBIDDEN/UNAUTHENTICATED になるのは想定外（JWTが更新前など）。詳細を隠さず404にする
    //   app/(admin)/admin/reports/page.tsx と同じ方針
    notFound()
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">
          NGワード管理
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {result.data.length}件
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          投稿・コメント作成時に自動検出される単語を管理します。「ブロック」は保存を拒否し、「警告のみ」は保存を妨げません。
        </p>
      </header>

      <NgWordManager initialItems={result.data} />
    </div>
  )
}
