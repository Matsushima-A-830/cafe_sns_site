import type { MetadataRoute } from 'next'
import { isBetaSignupClosed } from '@/lib/constants/beta'

/**
 * 検証ベータ期間中（D67）は全面クロール拒否。締切（BETA_SIGNUP_CLOSES_AT）後は
 * 本公開の恒久設計（管理・オーナー画面のみDisallow）に自動で切り替わる
 *   docs/architecture/routing.md #特殊ファイル配置
 */

// new Date() だけではビルド時に静的評価され固定されてしまうため、リクエスト時レンダリングを強制する
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  if (!isBetaSignupClosed()) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  return { rules: { userAgent: '*', disallow: ['/admin', '/owner'] } }
}
