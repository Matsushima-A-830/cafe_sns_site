// S_SIGNUP_BLOCKED: 登録不可（13歳未満）
// 詳細: docs/design/wireframes/auth.md#s_signup_blocked登録不可-13歳未満
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function SignupBlockedPage() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">登録できません</h1>
      <p className="text-muted-foreground">申し訳ありません。</p>
      <p className="text-muted-foreground">本サービスは13歳以上の方を対象としています。</p>
      <p className="text-muted-foreground">13歳になりましたらまたご登録ください。</p>
      <p className="text-muted-foreground">閲覧はログイン不要でご利用いただけます。</p>
      <Button asChild size="lg" className="mt-4">
        <Link href="/">ホームに戻る</Link>
      </Button>
    </div>
  )
}
