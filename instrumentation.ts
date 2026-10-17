import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Route Handlers・middleware 等、キャッチされずに素通りした例外のみ拾う。
// Server Actions の try/catch 内は拾わないため、lib/monitoring/report-error.ts で明示送信する
export const onRequestError = Sentry.captureRequestError
