import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * 未ログイン時にフィード上端へ出すヒント。消えないが押し付けがましくない色調にする
 *   docs/design/wireframes/browsing.md #S_HOME 未ログイン時のヒント表示
 */
export function GuestHint() {
  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-border-strong bg-muted px-4 py-3">
      <p className="text-sm text-muted-foreground">ログインすると保存・いいねができます</p>
      <Button asChild size="sm" variant="outline">
        <Link href="/login">ログイン</Link>
      </Button>
    </aside>
  )
}
