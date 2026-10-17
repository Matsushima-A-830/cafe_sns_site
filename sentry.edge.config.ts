import * as Sentry from '@sentry/nextjs'
import { serverEnv } from '@/lib/env.server'

Sentry.init({
  dsn: serverEnv.SENTRY_DSN,
  tracesSampleRate: 0,
})
