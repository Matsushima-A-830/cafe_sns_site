/**
 * 検証ベータの新規登録締切（JST 2026-11-30 23:59:59）。
 * オフセットを省略するとUTCとして解釈され、意図より約15時間早く締まる
 *   docs/product/pending-items.md D67
 */
export const BETA_SIGNUP_CLOSES_AT = new Date('2026-11-30T23:59:59+09:00')

export function isBetaSignupClosed(now: Date = new Date()): boolean {
  return now.getTime() > BETA_SIGNUP_CLOSES_AT.getTime()
}
