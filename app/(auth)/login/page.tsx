// S_LOGIN
// 詳細: docs/design/wireframes/auth.md#s_loginログイン
import { Suspense } from 'react'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-center text-2xl font-bold text-foreground">ログイン</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
