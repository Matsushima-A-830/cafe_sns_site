---

name: be-implement
description: バックエンド実装（Server Actions・Route Handlers・Supabaseクライアント層）を進める。TDD必須の領域。
---

# /be-implement — バックエンド実装

## 起動時に必ずやること

1. **RLSポリシーの再確認** — 対象テーブルの認可は [docs/architecture/data-model/tables.md](../../../docs/architecture/data-model/tables.md) で必ずチェック
2. **境界の判定** — 実装対象が Server Action か Route Handler かを判断
   - フォーム系ミューテーション → Server Action
   - Webhook / 署名URL発行 / 外部連携 → Route Handler
3. **既存の類似実装を Grep** — `app/_actions/` を確認
4. **`/test` を先に呼ぶ** — TDD必須領域

## Server Actions の基本骨格

```typescript
// app/_actions/follows.ts
'use server'

import {
  POSTGRES_INSUFFICIENT_PRIVILEGE,
  POSTGRES_UNIQUE_VIOLATION,
} from '@/lib/constants/postgres-error-codes'
import { createClient } from '@/lib/supabase/server'
import { followUserSchema } from '@/lib/validators/follows'
import type { Result } from '@/types/result'

// 返しうるエラーだけを列挙する。types/errors.ts の ErrorCode から絞り込む
type FollowUserError =
  | 'INVALID_INPUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'ALREADY_FOLLOWING'
  | 'INTERNAL_ERROR'

export async function followUser(input: unknown): Promise<Result<null, FollowUserError>> {
  // 1. 入力検証（Zod）
  const parsed = followUserSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  // 2. クライアント取得と、主体の確定
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  // 3. 認可はRLSに委譲。主体（follower_id）は必ずセッションから引く
  //    .select() で返り行を確認する（理由は「RLS違反は0件で返ることがある」参照）
  const { data, error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, followee_id: parsed.data.followeeId })
    .select('followee_id')
    .maybeSingle()

  // 4. SQLSTATE を既知のエラーコードに翻訳する
  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION) return { ok: false, error: 'ALREADY_FOLLOWING' }
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    console.error('[follows] フォローに失敗:', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  if (!data) return { ok: false, error: 'FORBIDDEN' }

  return { ok: true, data: null }
}
```

**`revalidatePath` は原則呼ばない。** 閲覧系ページは `auth.getUser()` で cookie を読む動的レンダリングで、そもそもフルルートキャッシュに載っていない（[pending-items D23](../../../docs/product/pending-items.md)）。呼んでも効果が無いうえ「キャッシュを消したから最新のはず」という誤解を生む。UI の再取得は Client 側の `router.refresh()` か、Server Action の戻り値で返す。ISR を復活させたときに改めて検討する。

## RLS違反は0件で返ることがある

**最重要。** `insert` / `update` / `delete` が RLS に弾かれたとき、必ずしも 42501 のエラーになるとは限らず、**「エラーなし・0件」の成功として返る経路がある**。`.select()` を付けて返り行を確認しないと、弾かれたのに成功扱いになる。

```typescript
const { data, error } = await supabase.from('follows').insert({...}).select('followee_id').maybeSingle()
if (error) { /* SQLSTATE で分岐 */ }
if (!data) return { ok: false, error: 'FORBIDDEN' }   // ← これが無いと嘘の成功を返す
```

composer・follows の両方で実際にこのバグを踏んでいる。**delete は例外**で、「存在しない行を消した」と「弾かれた」を区別する必要が無いケース（フォロー解除など）はそのまま成功にしてよい。

## SQLSTATE の分岐

コードは `lib/constants/postgres-error-codes.ts` に集約する（直書き禁止）。

| 定数                              | SQLSTATE | 典型的な原因                         |
| --------------------------------- | -------- | ------------------------------------ |
| `POSTGRES_UNIQUE_VIOLATION`       | 23505    | 二重登録（`ALREADY_FOLLOWING` 等）   |
| `POSTGRES_FOREIGN_KEY_VIOLATION`  | 23503    | 参照先が無い（`CAFE_NOT_FOUND` 等）  |
| `POSTGRES_CHECK_VIOLATION`        | 23514    | CHECK 制約（自己フォロー等）         |
| `POSTGRES_INSUFFICIENT_PRIVILEGE` | 42501    | RLS の USING / WITH CHECK に弾かれた |

**制約名まで見て分岐する。** SQLSTATE だけで判定すると、同じテーブルに制約が増えた瞬間に無関係な違反が誤ったメッセージになる。

```typescript
const SELF_FOLLOW_CONSTRAINT = 'follows_no_self_follow'
if (error.code === POSTGRES_CHECK_VIOLATION && error.message.includes(SELF_FOLLOW_CONSTRAINT)) { ... }
```

トリガーの `raise exception` は **SQLSTATE が P0001 固定**で、コード自体がメッセージ文字列になる（`POST_TAGS_LIMIT_EXCEEDED` 等）。`app/_actions/posts.ts` の `isRaisedWithMarker()` が実例。

## 設計原則

### 1. Result 型で戻り値を統一

```typescript
// types/result.ts
export type Result<T, E extends ErrorCode = ErrorCode> =
  | { ok: true; data: T }
  | { ok: false; error: E; details?: unknown }
```

- **`E` は `types/errors.ts` の `ErrorCode` に制約される。** 新しいコードを足すときは `types/errors.ts` と [error-catalog.md](../../../docs/architecture/error-catalog.md) の両方を更新する
- **関数ごとに返しうるコードだけを union で絞る**（`type FollowUserError = 'INVALID_INPUT' | ...`）。呼び出し側が網羅的に分岐できる
- **到達経路の無いコードを足さない。** RLS はブロック・非active・主体が非active をすべて 42501 で返して区別できないので、専用コードを用意しても死にコードになる
- 例外を throw しない（Server Actions は `redirect()` 以外の throw を避ける）
- UI 文言は `lib/utils/error-messages.ts` が持つ。Server Action はコードだけ返す

### 2. RLSに認可を委譲

**やってはいけない:**
```typescript
if (post.author_id !== userId) return { ok: false, error: 'FORBIDDEN' }  // NG
```

**やるべき:**
```typescript
// RLSポリシー UPDATE USING (auth.uid() = author_id) が効くので、
// 更新できなければ Supabase 側でエラー
const { error } = await supabase.from('posts').update(...).eq('id', postId)
```

これで認可漏れを構造的に防止する。

**RLSで表現できていない認可を見つけたら、アプリ層に書かずポリシー側を直す。** 実例: `follows_insert_own` は「本人か」「自分が active か」しか見ておらず、ブロック中・停止中の相手をフォローできた。Server Action に `if` を足すのではなく、ポリシーに `not is_blocked_either_way(followee_id)` を足すマイグレーションで解決した（`20260916120000`）。

**INSERT 時の判定だけでは不変条件が時間方向に保てない**ことにも注意する。「フォロー後にブロック」では行が残るため、`blocks` の AFTER INSERT トリガーで両方向の `follows` を消している（`20260916120100`）。

### 3. Zodスキーマを共有

`lib/validators/posts.ts` に定義したスキーマを:
- Server Action の入力検証
- クライアントのフォームバリデーション（react-hook-form）
- テスト
  の3箇所で共有する。

### 4. Supabase Client の切り替え

| 用途                                                | 関数                                                   | 場所                                                   |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Server Components / Server Actions / Route Handlers | `await createClient()`                                 | `lib/supabase/server.ts`                               |
| Client Components（限定）                           | `createClient()`（同名・ブラウザ用シングルトン）       | `lib/supabase/browser.ts`                              |
| middleware                                          | `updateSession(request)`（クライアントは内部に閉じる） | `lib/supabase/middleware.ts`                           |
| Service Role が必要な処理                           | `createAdminClient()`                                  | `lib/supabase/admin.ts`（`import 'server-only'` 付き） |

**注意:**
- `lib/supabase/server.ts` と `browser.ts` は**どちらも `createClient` という名前**。import 元を取り違えると Server Component で cookie を読まないクライアントが手に入り、**RLS のブロック判定が anon 扱いで素通りする**
- Service Role Client は**絶対にクライアントに送らない**
- 環境変数は用途で2分割されている。`lib/env.ts`（`NEXT_PUBLIC_*` のみ）と `lib/env.server.ts`（`'server-only'` 付き。`SUPABASE_SERVICE_ROLE_KEY` 等）。**サーバー限定の値を `lib/env.ts` に足さない**

## テストしやすい設計

**方式は2つある。読み取りか書き込みかで使い分ける。**

### 読み取り関数は supabase を引数で受ける（`lib/` に置く）

一覧・詳細の取得は Server Action にせず `lib/{feature}/` の純粋な関数にして、クライアントを**引数で受ける**。Server Component からも Server Action からも同じ関数を使え、統合テストでは任意のセッションのクライアントを渡せる。

```typescript
// lib/profiles/public-profile.ts
export async function getPublicProfile(
  supabase: Client,
  username: string,
): Promise<PublicProfile | null>
```

呼び出し元は**必ず閲覧者のセッション付きクライアント**を渡す。anon で読むと RLS のブロック判定（`is_blocked_either_way`）が常に偽になり、ブロックした相手の投稿が見える。

### 書き込み（Server Actions）はモジュールモック

Server Actions は主体をセッションから引く必要があるため内部で `createClient()` を呼ぶ。テストは `vi.mock` でモジュールごと差し替える。

```typescript
// app/_actions/posts.test.ts
const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

// テストごとに必要なメソッドだけ生やしたスタブを返す
createClientMock.mockResolvedValue(buildSupabaseStub({ user: { id: userId } }).stub)
```

`vi.hoisted` が要るのは、`vi.mock` のファクトリが import より前に巻き上げられるため。実例は `app/_actions/posts.test.ts` の `buildSupabaseStub()`。

**「入力検証で弾かれるケースは `createClient` を呼ばない」ことまでテストする**（`expect(createClientMock).not.toHaveBeenCalled()`）。Server Actions は事実上公開エンドポイントなので、未検証の入力で DB に触らないことが認可の一部になる。

## Route Handlers（`app/api/`）

### 実装対象

**Server Actions で代替できないものだけ**（[routing.md](../../../docs/architecture/routing.md)）。現時点で実在するのは1本だけ。

| ルート                   | 用途                              | 状態                       |
| ------------------------ | --------------------------------- | -------------------------- |
| `POST /api/uploads/sign` | 画像アップロードの署名付きURL発行 | 実装済み                   |
| `/api/auth/callback`     | Supabase OAuth コールバック       | 未実装（OAuth 未対応）     |
| `/api/webhooks/consent`  | 保護者同意リンク処理              | 未実装（pending-items B3） |

### 基本骨格

**Result 型を常に 200 OK で返す**のが本プロジェクトの規約（[error-catalog.md](../../../docs/architecture/error-catalog.md)）。HTTP ステータスで成否を判定させず、body の `ok` / `error` で判定する。

```typescript
// app/api/uploads/sign/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadSignSchema } from '@/lib/validators/uploads'
import type { Result } from '@/types/result'

export async function POST(
  request: Request,
): Promise<NextResponse<Result<PostImageUploadTarget, CreateUploadUrlError | 'INVALID_INPUT'>>> {
  // JSON でない body で throw させない
  const body: unknown = await request.json().catch(() => null)
  const parsed = uploadSignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() })
  }

  const supabase = await createClient()
  // 認証・認可・発行本体は lib/storage/ のラッパーに閉じる（Route Handler は薄く保つ）
  return NextResponse.json(await createPostImageUploadUrl(supabase, parsed.data))
}
```

**`auth.getSession()` を認可に使わない。** ローカルの cookie を読むだけで、期限切れトークンも検知できない。サーバー側の認可は必ず `auth.getUser()`（Auth サーバーに問い合わせて検証する）を通す。

`getSession()` を使ってよいのは2箇所だけで、どちらも理由がコメントに書いてある。1) `lib/supabase/middleware.ts` — `getUser()` で検証したうえで、JWT の `app_metadata` クレイム（role / status / onboarded）を読むため。2) `components`・`app/(browsing)/auth-nav.tsx` — ナビの見た目の出し分けだけの表示用途（実際の認可は RLS と middleware が担う）。

## 外部連携（S3, Google Maps, Google Business）

- 各外部SDKは `lib/{service}/` にラッパーを配置する。**Storage の読み書きも同様に `lib/storage/` 経由に閉じる**（S3 移行時の差し替え点を1箇所にするため）
- 環境変数は直接 `process.env` を読まず、`lib/env.ts`（public）/ `lib/env.server.ts`（server-only）経由で参照する
- 任意の環境変数は `optionalString()` を通す。`.env.example` の「[任意] は空のままでよい」に合わせ、空文字を未設定として扱うため（`z.string().min(1).optional()` は空文字を弾いてしまう）
- 失敗時のリトライ・タイムアウトを常に設定する

```typescript
// lib/env.server.ts — 'server-only' により、クライアントバンドルに混入した時点でビルドエラー
import 'server-only'
import { optionalString, publicEnvSchema } from './env'

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AWS_S3_BUCKET: optionalString(),
  SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
})

export const serverEnv = serverEnvSchema.parse(process.env)
```

## Supabase の便利機能

### RPC（Postgres 関数呼び出し）

複雑なクエリは Postgres 関数に切り出し、`supabase.rpc('function_name', args)` で呼ぶ。マイグレーションで管理。

### Realtime

通知バッジ、コメントのリアルタイム更新に使用検討。ただしMVP初期は必須ではない。

## エラーハンドリング方針

- **既知のエラー:** Result 型で返す（`INVALID_INPUT` / `NOT_FOUND` / `FORBIDDEN` / `CONFLICT` 等）
- **想定外エラー:** ログ出力（Sentry等）+ Result 型で `INTERNAL_ERROR` を返す
- **Zodエラー:** そのまま `details` に含めてクライアントに返す（フィールド別バリデーション表示のため）

## セキュリティチェック

- [ ] Service Role Client を Client Component に送っていない
- [ ] 環境変数は `lib/env.ts` 経由で参照している
- [ ] RLS ポリシーに認可を委譲している
- [ ] Zodスキーマで入力を検証している
- [ ] SQLインジェクション対策（Supabase Client はパラメータ化されるが、raw SQL は要注意）
- [ ] レートリミット（重要処理は Supabase Edge Functions or Cloudflare）
- [ ] 秘密情報を Response に含めていない

## 実装後のセルフレビュー

- [ ] Result 型で戻り値を統一している
- [ ] Zodスキーマを共有している
- [ ] RLSに認可を委譲している
- [ ] テスト（ユニット + RLS統合）を書いた
- [ ] 書き込みで `.select()` の返り行を確認している（RLS違反を嘘の成功にしていない）
- [ ] SQLSTATE の分岐が制約名まで見ている
- [ ] `/self-review` を実行
- [ ] `/board-update` で実装状況ボードを更新

## やらないこと

- 独自認証システム（Supabase Auth のみ）
- Redis 等の追加インフラ（MVPは Postgres で完結）
- GraphQL サーバー（Supabase の PostgREST + RPC で足りる）
- 巨大な JOIN を Server Action に書く（Postgres 関数化する）
