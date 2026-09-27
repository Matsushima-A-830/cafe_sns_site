import { InfoBanner } from './info-banner'

/**
 * 未ログイン時にフィード上端へ出すヒント。消えないが押し付けがましくない色調にする
 *   docs/design/wireframes/browsing.md #S_HOME 未ログイン時のヒント表示
 */
export function GuestHint() {
  return (
    <InfoBanner message="ログインすると保存・いいねができます" href="/login" ctaLabel="ログイン" />
  )
}
