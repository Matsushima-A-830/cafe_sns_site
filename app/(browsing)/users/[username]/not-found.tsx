// S_USER_PROFILE_PUBLIC の 404。存在しない username・停止/削除済み・ブロック関係は
// すべてここへ落とす（区別して伝えると、その相手が存在することやブロックの向きが漏れる）
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function UserNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-foreground">ユーザーが見つかりませんでした</h1>
      <p className="text-muted-foreground">
        ユーザーネームが変わったか、アカウントが利用できなくなった可能性があります。
      </p>
      <Button asChild size="lg">
        <Link href="/">ホームに戻る</Link>
      </Button>
    </div>
  )
}
