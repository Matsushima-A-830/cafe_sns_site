import 'server-only'
import { Resend } from 'resend'
import { serverEnv } from '@/lib/env.server'

/**
 * Resend の薄いラッパー。カスタムメール送信はこのファイルが最初の実装なので、
 * 呼び出し側（Server Actions）が resend パッケージを直接importしないよう境界を作る
 */
export async function sendEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!serverEnv.RESEND_API_KEY) {
    console.error('RESEND_API_KEY 未設定のためメール送信をスキップした', input.to)
    return { ok: false, error: 'RESEND_API_KEY_MISSING' }
  }

  const resend = new Resend(serverEnv.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: serverEnv.RESEND_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    html: input.html,
  })

  if (error) {
    console.error('Resend送信失敗', input.to, error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
