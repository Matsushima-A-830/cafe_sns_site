import * as Sentry from '@sentry/nextjs'

/**
 * Server Actions の try/catch 内（INTERNAL_ERROR / EXTERNAL_SERVICE_ERROR 等の
 * 発生源）は Sentry の自動計装が拾わないため、console.error と captureException を
 * ここで束ねて呼ぶ。既存の `console.error('[scope] message:', cause)` 規約を維持する
 *   docs/architecture/error-catalog.md #Sentry送信対象
 */
export function reportError(scope: string, message: string, cause?: unknown): void {
  console.error(`[${scope}] ${message}:`, cause)
  Sentry.captureException(cause instanceof Error ? cause : new Error(`[${scope}] ${message}`), {
    tags: { scope },
  })
}
