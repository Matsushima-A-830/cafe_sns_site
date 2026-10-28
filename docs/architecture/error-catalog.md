# エラーカタログ

`Result<T, E>` 型 (`{ ok: false, error: 'CODE' }`) で返すエラーコードの標準リスト。**新規エラー追加時は必ずこのカタログに登録**し、勝手な文字列を発明しない。

## 設計方針

- **短い ALL_CAPS スネークケース** — `INVALID_INPUT`, `NOT_FOUND` 等
- **意味を階層化しない** — `USER_PROFILE_INVALID_NAME` のような長い名前は避け、`INVALID_INPUT` + `details` で表現
- **クライアント表示は変換テーブル経由** — サーバーはコードのみ返し、UIメッセージはフロント側で決める（i18n対応の余地）
- **HTTP status とは分離** — Result 型は常に `200 OK` で返す。**Route Handlers も同様に一律 `200 OK` を返し**、成否は
  body の `ok`/`error` で判定する（Server Actions と同じ規約に統一。監視・CDN側でHTTPステータスから失敗を判別できない点は
  承知の上での選択。`POST /api/uploads/sign` の実装で最初に適用した）

---

## 共通エラーコード

| コード                   | 意味                                           | 発生源               | UI表示例                                                             |
| ------------------------ | ---------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| `INVALID_INPUT`          | 入力バリデーション失敗（Zod）                  | すべて               | 「入力内容を確認してください」+ `details` から各フィールドエラー表示 |
| `UNAUTHENTICATED`        | セッションなし                                 | Server Actions / API | ログイン画面へリダイレクト                                           |
| `FORBIDDEN`              | 認可失敗（RLS弾き含む）                        | すべて               | 「この操作を行う権限がありません」                                   |
| `NOT_FOUND`              | リソース不在                                   | すべて               | 「対象が見つかりませんでした」                                       |
| `CONFLICT`               | 状態衝突（重複・楽観ロック等）                 | すべて               | 状況に応じたメッセージ                                               |
| `RATE_LIMITED`           | レート制限超過                                 | Server Actions / API | 「しばらく待ってから再試行してください」                             |
| `INTERNAL_ERROR`         | 想定外エラー                                   | すべて               | 「エラーが発生しました。時間をおいて再試行してください」+ Sentry送信 |
| `EXTERNAL_SERVICE_ERROR` | 外部API失敗（Supabase Storage, Google Maps等） | 外部連携層           | サービス別のリカバリ手順                                             |

---

## ドメイン別エラーコード

### アカウント / 認証

| コード                          | 意味                                                                                                                                                                                                                  | 発生源                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `EMAIL_ALREADY_EXISTS`          | メールアドレス重複                                                                                                                                                                                                    | signup                                                                                                    |
| `PHONE_ALREADY_EXISTS`          | 電話番号重複                                                                                                                                                                                                          | signup ※**MVP未使用**（電話番号登録は見送り → [pending-items B6](../product/pending-items.md)）。型は残す |
| `USERNAME_ALREADY_EXISTS`       | username重複                                                                                                                                                                                                          | onboarding                                                                                                |
| `INVALID_CREDENTIALS`           | ログイン失敗                                                                                                                                                                                                          | login                                                                                                     |
| `OTP_INVALID`                   | 確認コード不一致                                                                                                                                                                                                      | signup verify                                                                                             |
| `OTP_EXPIRED`                   | 確認コード期限切れ                                                                                                                                                                                                    | signup verify                                                                                             |
| `AGE_RESTRICTED`                | 13歳未満のブロック                                                                                                                                                                                                    | signup birthdate                                                                                          |
| `BIRTHDATE_REQUIRED`            | 生年月日未入力（onboarding/profile に生年月日無しで到達）                                                                                                                                                             | submitProfile                                                                                             |
| `CONSENT_REQUIRED`              | 保護者同意未完了で操作不可                                                                                                                                                                                            | 各種投稿系Action                                                                                          |
| `CONSENT_TOKEN_INVALID`         | 保護者同意リンクトークン無効（期限切れ・使用済み含む）。※`GET /api/consent/confirm`はリダイレクトのみでResult型を返さないため、実際は`?consent=invalid`クエリで表現する。このコード自体は将来JSON APIが要る場合の予約 | api/consent/confirm                                                                                       |
| `GUARDIAN_EMAIL_SELF_FORBIDDEN` | 保護者メールが未成年本人のアカウントメールと同一（自己承認の迂回を防ぐ）                                                                                                                                              | submitGuardianConsent / updateGuardianEmail                                                               |
| `ACCOUNT_SUSPENDED`             | 停止中アカウント                                                                                                                                                                                                      | すべて                                                                                                    |
| `ACCOUNT_DELETED`               | 削除済みアカウント                                                                                                                                                                                                    | login                                                                                                     |
| `BETA_SIGNUP_CLOSED`            | 検証ベータの新規登録締切後（[pending-items D67](../product/pending-items.md#d67-招待制検証ベータの技術的準備)）                                                                                                       | signup                                                                                                    |

### 投稿 / コメント

| コード                       | 意味                                                                                                                                                                                         | 発生源                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `POST_NOT_FOUND`             | 投稿不在                                                                                                                                                                                     | posts系                                               |
| `POST_ALREADY_DELETED`       | 削除済み投稿                                                                                                                                                                                 | posts系                                               |
| `POST_TAGS_LIMIT_EXCEEDED`   | タグ数上限（5個）                                                                                                                                                                            | createPost                                            |
| `POST_IMAGES_LIMIT_EXCEEDED` | 画像枚数上限（10枚）                                                                                                                                                                         | createPost                                            |
| `POST_BODY_EMPTY`            | 本文空（短文投稿は画像1枚以上あれば空文可）                                                                                                                                                  | createPost / createComment（コメントは trim 後0文字） |
| `POST_BODY_TOO_LONG`         | 本文が上限超過（投稿: 平文50,000文字 or Tiptap JSON 512KB。コメント: 500文字。[tables.md #posts](./data-model/tables.md#posts) / [#comments](./data-model/tables.md#comments)）              | createPost / createComment                            |
| `NG_WORD_DETECTED`           | NGワード検出（`severity=block`）                                                                                                                                                             | createPost / createComment                            |
| `COMMENT_NOT_FOUND`          | コメント不在（`createComment` では存在しない/削除済みの `parentId` を指定した場合）                                                                                                          | comments系                                            |
| `COMMENT_HAS_REPLIES`        | 返信が付いたトップレベルコメントを、投稿主ではない作者本人が削除しようとした（投稿主なら返信ごと連動して削除できる。`guard_comments_moderation_columns` / `cascade_delete_comment_replies`） | deleteComment                                         |

**`reservePost`（composer 表示開始時の hidden 予約行作成、[pending-items D17](../product/pending-items.md#d17-createpost-の-imagepaths-は画像アップロード時点で投稿行が既に存在することを前提にしている解消済み)）** は上記の投稿固有コードは返さず、共通エラーコード（`INVALID_INPUT` / `UNAUTHENTICATED` / `FORBIDDEN` / `INTERNAL_ERROR`）のみを使う。

### インタラクション

| コード                  | 意味                 | 発生源                                                               |
| ----------------------- | -------------------- | -------------------------------------------------------------------- |
| `ALREADY_LIKED`         | 二重いいね           | **未使用** — `likePost` は二重いいねを成功として扱い、確定件数を返す |
| `ALREADY_BOOKMARKED`    | 二重保存             | toggleBookmark                                                       |
| `ALREADY_FOLLOWING`     | 二重フォロー         | toggleFollow                                                         |
| `SELF_FOLLOW_FORBIDDEN` | 自分自身フォロー禁止 | toggleFollow                                                         |
| `BLOCKED_USER`          | ブロック関係あり     | 各種インタラクション                                                 |
| `BLOCK_SELF_FORBIDDEN`  | 自分自身ブロック禁止 | toggleBlock                                                          |

### カフェ / エリア

| コード                 | 意味                     | 発生源               |
| ---------------------- | ------------------------ | -------------------- |
| `CAFE_NOT_FOUND`       | カフェ不在               | cafes系              |
| `CAFE_ALREADY_CLAIMED` | 既に別ユーザーが認証済み | claimCafe            |
| `AREA_CODE_UNKNOWN`    | 不明なエリアコード       | cafe作成・エリア検索 |

### 経営者 / 認証申請

| コード                          | 意味                                                                                 | 発生源                   |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| `DOCUMENTS_INSUFFICIENT`        | 提出書類2点未満                                                                      | claimCafe                |
| `VERIFICATION_ALREADY_PENDING`  | 既存申請あり                                                                         | claimCafe                |
| `VERIFICATION_REJECTED`         | 却下履歴あり（待機期間なしで即再申請可、S_OWNER_CLAIM で理由を表示するための情報値） | claimCafe                |
| `VERIFICATION_ALREADY_RESOLVED` | 別の admin が既に判定済み（pending でなくなっていた）                                | resolveOwnerVerification |
| `NOT_OWNER`                     | オーナー権限なし                                                                     | owner系                  |
| `ALREADY_REGULAR`               | 既に有効な常連認定がある                                                             | awardRegular             |

### アップロード / ストレージ

| コード                   | 意味                                                                     | 発生源                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FILE_TOO_LARGE`         | サイズ上限超過（post-images: 10MB、owner-documents: 10MB、avatars: 2MB） | uploads/sign・uploads/owner-document/sign・uploads/avatar/sign                                                                                                        |
| `UNSUPPORTED_MEDIA_TYPE` | 対応外形式                                                               | uploads/sign・uploads/owner-document/sign・uploads/avatar/sign                                                                                                        |
| `EXIF_STRIP_FAILED`      | EXIF除去失敗、またはサーバー側再検証でGPS検出                            | クライアント側処理 / createPost・createOfficialPost（post-images, A10のサーバー側保険）・updateProfile（avatars, 同様の保険。`verifyNoGpsExif` の bucket 引数で共用） |
| `UPLOAD_FAILED`          | Storage へのアップロード失敗                                             | クライアント側                                                                                                                                                        |

### 通報 / モデレーション

| コード                     | 意味                                                                          | 発生源        |
| -------------------------- | ----------------------------------------------------------------------------- | ------------- |
| `SELF_REPORT_FORBIDDEN`    | 自分自身への通報禁止                                                          | createReport  |
| `REPORT_ALREADY_SUBMITTED` | 同一対象への**未処理の**通報が既にある（DB の部分ユニークインデックスで担保） | createReport  |
| `REPORT_ALREADY_RESOLVED`  | 別の admin が既に判定済み（pending/reviewing でなくなっていた）               | resolveReport |

---

## Result 型の実装例

```typescript
// types/errors.ts
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'EMAIL_ALREADY_EXISTS'
  | 'PHONE_ALREADY_EXISTS'
  | 'USERNAME_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'AGE_RESTRICTED'
  | 'BIRTHDATE_REQUIRED'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_TOKEN_INVALID'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DELETED'
  | 'POST_NOT_FOUND'
  | 'POST_ALREADY_DELETED'
  | 'POST_TAGS_LIMIT_EXCEEDED'
  | 'POST_IMAGES_LIMIT_EXCEEDED'
  | 'POST_BODY_EMPTY'
  | 'POST_BODY_TOO_LONG'
  | 'NG_WORD_DETECTED'
  | 'COMMENT_NOT_FOUND'
  | 'COMMENT_HAS_REPLIES'
  | 'ALREADY_LIKED'
  | 'ALREADY_BOOKMARKED'
  | 'ALREADY_FOLLOWING'
  | 'SELF_FOLLOW_FORBIDDEN'
  | 'BLOCKED_USER'
  | 'BLOCK_SELF_FORBIDDEN'
  | 'CAFE_NOT_FOUND'
  | 'CAFE_ALREADY_CLAIMED'
  | 'AREA_CODE_UNKNOWN'
  | 'DOCUMENTS_INSUFFICIENT'
  | 'VERIFICATION_ALREADY_PENDING'
  | 'VERIFICATION_REJECTED'
  | 'VERIFICATION_ALREADY_RESOLVED'
  | 'NOT_OWNER'
  | 'ALREADY_REGULAR'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'EXIF_STRIP_FAILED'
  | 'UPLOAD_FAILED'
  | 'SELF_REPORT_FORBIDDEN'
  | 'REPORT_ALREADY_SUBMITTED'
  | 'REPORT_ALREADY_RESOLVED'
```

```typescript
// types/result.ts
import type { ErrorCode } from './errors'

export type Result<T, E extends ErrorCode = ErrorCode> =
  | { ok: true; data: T }
  | { ok: false; error: E; details?: unknown }
```

**メリット:**
- 未登録エラーコードは TypeScript が弾く（型安全）
- IDE 補完で候補が出る
- カタログ追加漏れを構造的に防ぐ

---

## クライアント表示ルール

`lib/errors/messages.ts` に日本語メッセージを集約:

```typescript
export const errorMessages: Record<ErrorCode, string> = {
  INVALID_INPUT: '入力内容を確認してください',
  UNAUTHENTICATED: 'ログインが必要です',
  FORBIDDEN: 'この操作を行う権限がありません',
  NOT_FOUND: '対象が見つかりませんでした',
  AGE_RESTRICTED: '13歳未満のご利用はできません',
  CONSENT_REQUIRED: '保護者の同意完了後にご利用いただけます',
  NG_WORD_DETECTED: 'この内容は投稿できません。表現を見直してください',
  // ...
}
```

`useToast` や `<FormError>` 等で `errorMessages[result.error]` を表示。

---

## Sentry 送信対象

以下のみ Sentry へ通知（それ以外はユーザー操作起因のため通知不要）:
- `INTERNAL_ERROR`
- `EXTERNAL_SERVICE_ERROR`
- `EXIF_STRIP_FAILED`（頻発なら EXIF ライブラリ更新の兆候）
- `UPLOAD_FAILED`（Storage or ネットワーク問題）
- 未登録のエラーコード（実装漏れ）

---

## 追加時のルール

新しいエラーコードが必要になったら:
1. **本カタログに追加**（ドメイン別セクション）
2. **`types/errors.ts` の `ErrorCode` に追加**
3. **`lib/errors/messages.ts` に日本語メッセージ追加**
4. **必要なら Sentry送信対象 に追加**
5. **PR説明にリンク**

上記4ステップを守れば追加漏れがなくなる。
