// S_ACCOUNT_PENDING: 保護者同意待ち
// 詳細: docs/design/wireframes/auth.md#s_account_pending同意待ち
//
// NOTE: 再送・メールアドレス変更は未実装（guardian_email の同意インフラ自体が pending-items B3 未決のため）
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function AccountPendingPage() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">保護者の同意をお待ちしています</h1>
      <p className="text-muted-foreground">保護者の方に確認メールをお送りしました。</p>
      <p className="text-muted-foreground">
        同意リンクをクリックするとすべての機能をお使いいただけます。
      </p>
      <p className="text-muted-foreground">
        現在は投稿・いいね・コメントはご利用いただけません。閲覧のみ可能です。
      </p>
      <Button asChild size="lg" variant="outline" className="mt-4">
        <Link href="/">まずは閲覧を始める</Link>
      </Button>
    </div>
  )
}
