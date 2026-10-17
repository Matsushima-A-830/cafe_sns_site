import * as Sentry from '@sentry/nextjs'
import { serverEnv } from '@/lib/env.server'

// DSN未設定（Preview/ローカル）では Sentry.init が no-op になるため、
// 実際に送信されるのは Vercel Production に SENTRY_DSN を設定したときだけ
Sentry.init({
  dsn: serverEnv.SENTRY_DSN,
  tracesSampleRate: 0,
})
