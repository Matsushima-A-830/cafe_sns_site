import 'server-only'
import { Resend } from 'resend'
import { serverEnv } from '@/lib/env.server'
import { reportError } from '@/lib/monitoring/report-error'

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
    reportError('email', 'RESEND_API_KEY 未設定のためメール送信をスキップした', input.to)
    return { ok: false, error: 'RESEND_API_KEY_MISSING' }
  }

  const resend = new Resend(serverEnv.RESEND_API_KEY)
  // resend.emails.send は {error} を返す設計だが、SDK側の例外（ネットワーク断等）は
  // 素通りしうる。呼び出し元のServer Actionsがcatchしない前提（境界で握る規約）なので、ここで拾う
  try {
    const { error } = await resend.emails.send({
      from: serverEnv.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
    })

    if (error) {
      reportError('email', 'Resend送信失敗', { to: input.to, error })
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (cause) {
    reportError('email', 'Resend送信で例外が発生', cause)
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
  }
}
