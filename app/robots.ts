import type { MetadataRoute } from 'next'
import { isBetaSignupClosed } from '@/lib/constants/beta'

/**
 * 検証ベータ期間中（D67）は全面クロール拒否。締切（BETA_SIGNUP_CLOSES_AT）後は
 * 本公開の恒久設計（管理・オーナー画面のみDisallow）に自動で切り替わる
 *   docs/architecture/routing.md #特殊ファイル配置
 *
 * new Date() 呼び出しだけだとビルド時に静的評価され、締切後もデプロイまで
 * 古い結果のまま配信されてしまうため、明示的にリクエスト時レンダリングを強制する
 */
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  if (!isBetaSignupClosed()) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  return { rules: { userAgent: '*', disallow: ['/admin', '/owner'] } }
}
