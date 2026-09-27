// S_ACCOUNT_PENDING: 保護者同意待ち
// 詳細: docs/design/wireframes/auth.md#s_account_pending同意待ち
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PendingActions } from './pending-actions'

type PageProps = {
  searchParams: Promise<{ consent?: string }>
}

export default async function AccountPendingPage({ searchParams }: PageProps) {
  const { consent } = await searchParams

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

      {consent === 'success' && (
        <p aria-live="polite" className="text-success">
          保護者の同意が確認できました。「状態を確認する」を押してください
        </p>
      )}
      {consent === 'invalid' && (
        <p role="alert" aria-live="polite" className="text-danger">
          同意リンクが無効か、有効期限が切れています。「再送する」からやり直してください
        </p>
      )}

      <PendingActions />

      <Button asChild size="lg" variant="outline" className="mt-4">
        <Link href="/">まずは閲覧を始める</Link>
      </Button>
    </div>
  )
}
