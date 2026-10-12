import 'server-only'
import { env } from '@/lib/env'
import { sendEmail } from './resend'

/**
 * 保護者同意メールの文面と送信。confirmUrl は
 * GET /api/consent/confirm?token=... （ブラウザの通常ナビゲーション）
 */
export async function sendGuardianConsentEmail(input: {
  guardianEmail: string
  token: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const confirmUrl = `${env.NEXT_PUBLIC_SITE_URL}/api/consent/confirm?token=${encodeURIComponent(input.token)}`

  return sendEmail({
    to: input.guardianEmail,
    subject: '【ミツカフェ】お子様のアカウント利用に関する同意のお願い',
    html: `
      <p>お子様が「ミツカフェ」への登録を申請しています。</p>
      <p>利用を許可される場合は、以下のリンクをクリックしてください。</p>
      <p><a href="${confirmUrl}">${confirmUrl}</a></p>
      <p>このリンクの有効期限は7日間です。心当たりがない場合はこのメールを破棄してください。</p>
    `,
  })
}
