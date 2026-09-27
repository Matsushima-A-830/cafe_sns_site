import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * pending_consent（保護者同意待ち）ユーザーが S_MY_HOME を訪問した時のバナー
 *   docs/design/wireframes/auth.md #S_ACCOUNT_PENDING「ログイン後もこの状態のときはS_MY_HOME訪問時に上部バナー表示」
 */
export function PendingConsentBanner() {
  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-border-strong bg-muted px-4 py-3">
      <p className="text-sm text-muted-foreground">
        保護者の同意待ちです。投稿・いいね・コメントは同意後にご利用いただけます
      </p>
      <Button asChild size="sm" variant="outline">
        <Link href="/account/pending">状態を確認する</Link>
      </Button>
    </aside>
  )
}
