import Link from 'next/link'
import { Button } from '@/components/ui/button'

type Props = {
  message: string
  href: string
  ctaLabel: string
}

/** GuestHint・PendingConsentBanner共通の「メッセージ+CTAリンク」バナーの見た目 */
export function InfoBanner({ message, href, ctaLabel }: Props) {
  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-border-strong bg-muted px-4 py-3">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild size="sm" variant="outline">
        <Link href={href}>{ctaLabel}</Link>
      </Button>
    </aside>
  )
}
