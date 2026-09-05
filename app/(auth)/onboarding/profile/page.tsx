// S_ONBOARD_PROFILE: プロフィール初期設定
// 詳細: docs/design/wireframes/auth.md#s_onboard_profileプロフィール初期設定
//
// NOTE: アバターアップロードは未実装（Storage 署名アップロードは別スコープ）。
// 表示名・ユーザーネームのみ必須で、ワイヤーフレームの「スキップ」導線は設けていない
// （username は DB の NOT NULL/UNIQUE 制約があり省略できないため）
import { ProfileForm } from './profile-form'

export default function OnboardProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">はじめまして！</h1>
        <p className="text-muted-foreground">少しだけ教えてください</p>
      </div>
      <ProfileForm />
    </div>
  )
}
