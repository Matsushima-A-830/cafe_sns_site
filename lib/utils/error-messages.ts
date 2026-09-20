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
  BIRTHDATE_REQUIRED: '生年月日を入力してください',
  ACCOUNT_SUSPENDED: 'このアカウントは停止されています',
  ACCOUNT_DELETED: 'このアカウントは削除されています',
  AREA_CODE_UNKNOWN: '選択したエリアが見つかりませんでした',
  CONSENT_REQUIRED: '保護者の同意が必要です',
  // 投稿 / composer
  POST_NOT_FOUND: '投稿が見つかりませんでした',
  POST_BODY_EMPTY: '本文か写真のどちらかを入力してください',
  POST_BODY_TOO_LONG: '本文が長すぎます。分割して投稿してください',
  COMMENT_NOT_FOUND: '返信先のコメントが見つかりませんでした',
  COMMENT_HAS_REPLIES: '返信が付いているため削除できません。投稿主に削除を依頼してください',
  POST_TAGS_LIMIT_EXCEEDED: 'タグは5個までです',
  POST_IMAGES_LIMIT_EXCEEDED: '写真は10枚までです',
  CAFE_NOT_FOUND: '選択したカフェが見つかりませんでした。選び直してください',
  // フォロー
  ALREADY_FOLLOWING: 'すでにフォローしています',
  SELF_FOLLOW_FORBIDDEN: '自分自身はフォローできません',
  // アップロード
  FILE_TOO_LARGE: '画像のサイズが大きすぎます',
  UNSUPPORTED_MEDIA_TYPE: 'この形式の画像は使えません',
  EXIF_STRIP_FAILED: '画像の位置情報を削除できませんでした。別の画像をお試しください',
  UPLOAD_FAILED: '画像をアップロードできませんでした。通信状況を確認してください',
}

export function errorMessage(code: ErrorCode): string {
  return messages[code] ?? messages.INTERNAL_ERROR ?? 'エラーが発生しました'
}
