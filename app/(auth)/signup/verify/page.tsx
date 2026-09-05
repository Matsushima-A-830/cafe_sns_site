// S_SIGNUP (2/3): メール確認コード(OTP)
// 詳細: docs/design/wireframes/auth.md#s_signup新規登録-認証情報入力
import { redirect } from 'next/navigation'
import { VerifyForm } from './verify-form'

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  if (!email) redirect('/signup')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">新規登録 (2/3)</p>
        <h1 className="text-2xl font-bold text-foreground">確認コードを送信しました</h1>
      </div>
      <VerifyForm email={email} />
    </div>
  )
}
