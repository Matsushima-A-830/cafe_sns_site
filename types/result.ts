import type { ErrorCode } from './errors'

export type Result<T, E extends ErrorCode = ErrorCode> =
  | { ok: true; data: T }
  | { ok: false; error: E; details?: unknown }
