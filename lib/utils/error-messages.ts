import type { ErrorCode } from '@/types/errors'

// サーバーはコードのみ返し、UIメッセージはここで決める（docs/architecture/error-catalog.md）
const messages: Partial<Record<ErrorCode, string>> = {
  INVALID_INPUT: '入力内容を確認してください',
  UNAUTHENTICATED: 'ログインが必要です',
  FORBIDDEN: 'この操作を行う権限がありません',
  NOT_FOUND: '対象が見つかりませんでした',
  CONFLICT: '既に登録されています',
  RATE_LIMITED: 'しばらく待ってから再試行してください',
  INTERNAL_ERROR: 'エラーが発生しました。時間をおいて再試行してください',
  EMAIL_ALREADY_EXISTS: 'このメールアドレスは既に登録されています',
  USERNAME_ALREADY_EXISTS: 'このユーザーネームは既に使われています',
  INVALID_CREDENTIALS: 'メールアドレスまたはパスワードが正しくありません',
  OTP_INVALID: '確認コードが正しくありません',
  OTP_EXPIRED: '確認コードの有効期限が切れています。再送してください',
  AGE_RESTRICTED: '本サービスは13歳以上の方を対象としています',
  ACCOUNT_SUSPENDED: 'このアカウントは停止されています',
  ACCOUNT_DELETED: 'このアカウントは削除されています',
  AREA_CODE_UNKNOWN: '選択したエリアが見つかりませんでした',
}

export function errorMessage(code: ErrorCode): string {
  return messages[code] ?? messages.INTERNAL_ERROR ?? 'エラーが発生しました'
}
