// S_SIGNUP (1/3): 認証情報入力
// 詳細: docs/design/wireframes/auth.md#s_signup新規登録-認証情報入力
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { isBetaSignupClosed } from '@/lib/constants/beta'
import { SignupForm } from './signup-form'

// new Date() 呼び出しだけだとビルド時に静的評価され、締切後もデプロイまで
// 古い結果のまま配信されてしまうため、明示的にリクエスト時レンダリングを強制する
export const dynamic = 'force-dynamic'

export default function SignupPage() {
  // Server Action側（signUp）でも同じ締切チェックをしている。ここでの表示切替は
  // フォームを送信する前にUXとして案内するためで、サインアップ自体の拒否はこちらに依存しない（D67）
  if (isBetaSignupClosed()) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-bold text-foreground">新規登録は終了しました</h1>
        <p className="text-muted-foreground">検証ベータの新規登録期間は終了しました。</p>
        <Button asChild size="lg" className="mt-4">
          <Link href="/">ホームに戻る</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">新規登録 (1/3)</p>
        <h1 className="text-2xl font-bold text-foreground">アカウント情報</h1>
      </div>
      <SignupForm />
    </div>
  )
}
