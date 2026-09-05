// S_SIGNUP (3/3): 生年月日入力（年齢確認）
// 詳細: docs/design/wireframes/auth.md#s_signup新規登録-認証情報入力
import { BirthdateForm } from './birthdate-form'

export default function BirthdatePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">新規登録 (3/3)</p>
        <h1 className="text-2xl font-bold text-foreground">生年月日を入力してください</h1>
      </div>
      <BirthdateForm />
    </div>
  )
}
