// S_SIGNUP (1/3): 認証情報入力
// 詳細: docs/design/wireframes/auth.md#s_signup新規登録-認証情報入力
import { SignupForm } from './signup-form'

export default function SignupPage() {
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
