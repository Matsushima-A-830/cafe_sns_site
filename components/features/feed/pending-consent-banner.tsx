import { InfoBanner } from './info-banner'

/**
 * pending_consent（保護者同意待ち）ユーザーが S_MY_HOME を訪問した時のバナー
 *   docs/design/wireframes/auth.md #S_ACCOUNT_PENDING「ログイン後もこの状態のときはS_MY_HOME訪問時に上部バナー表示」
 */
export function PendingConsentBanner() {
  return (
    <InfoBanner
      message="保護者の同意待ちです。投稿・いいね・コメントは同意後にご利用いただけます"
      href="/account/pending"
      ctaLabel="状態を確認する"
    />
  )
}
