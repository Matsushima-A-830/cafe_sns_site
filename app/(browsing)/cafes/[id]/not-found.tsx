// S_CAFE_DETAIL の 404。存在しないID・閉店（closed）・非公開（hidden）はすべてここへ落とす
// （区別して伝えると、その行が存在することが漏れる）
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function CafeNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-foreground">カフェが見つかりませんでした</h1>
      <p className="text-muted-foreground">閉店したか、掲載が取り下げられた可能性があります。</p>
      <Button asChild size="lg">
        <Link href="/explore">カフェを探す</Link>
      </Button>
    </div>
  )
}
