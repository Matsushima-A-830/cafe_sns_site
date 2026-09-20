// S_BLOCKED_USERS: ブロック管理
// 詳細: docs/design/wireframes/mypage.md#s_blocked_usersブロック管理 / docs/architecture/routing.md
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listBlockedUsers } from '@/app/_actions/blocks'
import { BlockedUserList } from '@/components/features/blocks/blocked-user-list'

export const metadata: Metadata = { title: 'ブロック中のユーザー' }

export default async function BlockedUsersPage() {
  const result = await listBlockedUsers()
  if (!result.ok) {
    // DraftsPage と同じ方針: middleware が既にログインを保証しているので、
    // UNAUTHENTICATED 以外を丸めて /login に送ると原因が分からなくなる
    if (result.error !== 'UNAUTHENTICATED') {
      throw new Error(`ブロック一覧の取得に失敗しました: ${result.error}`)
    }
    redirect('/login?next=%2Fsettings%2Fblocked')
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/settings"
          className="self-start text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
        >
          ← 設定
        </Link>
        <h1 className="text-2xl font-bold text-foreground">
          ブロック中のユーザー
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {result.data.length}件
          </span>
        </h1>
      </header>

      <BlockedUserList initialUsers={result.data} />
    </div>
  )
}
