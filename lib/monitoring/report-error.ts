import * as Sentry from '@sentry/nextjs'

/**
 * Server Actionsのtry/catch内はSentryの自動計装が拾わないため、ここで明示送信する
 *   docs/architecture/error-catalog.md #Sentry送信対象
 */
export function reportError(scope: string, message: string, cause?: unknown): void {
  console.error(`[${scope}] ${message}:`, cause)

  if (cause instanceof Error) {
    Sentry.captureException(cause, { tags: { scope } })
    return
  }

  // Postgrest等の { code, message } はError型ではないため、messageをタイトルに
  // 引き継いで握り潰さず、元の値はextraに残す
  const causeMessage =
    cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string'
      ? cause.message
      : undefined
  const error = new Error(`[${scope}] ${message}${causeMessage ? `: ${causeMessage}` : ''}`)
  Sentry.captureException(error, { tags: { scope }, extra: { cause } })
}
