// S_MINOR_CONSENT: 13〜17歳の保護者同意
// 詳細: docs/design/wireframes/auth.md#s_minor_consent1317歳-保護者同意
//
// NOTE: 保護者への同意メール送信は未実装（pending-items B3 が未決のため）。
// guardianEmail を保持するところまでを実装している
import { ConsentForm } from './consent-form'

export default function ConsentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">追加ステップ: 保護者同意</p>
        <h1 className="text-2xl font-bold text-foreground">保護者の同意が必要です</h1>
      </div>
      <ConsentForm />
    </div>
  )
}
