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
// app/_actions/posts.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createPostSchema } from '@/lib/validators/posts'
import { getServerSupabase } from '@/lib/supabase/server'
import type { Result } from '@/types/result'

export async function createPost(
  input: unknown,
): Promise<Result<{ postId: string }>> {
  // 1. 入力検証（Zod）
  const parsed = createPostSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }
  }

  // 2. Supabase クライアント取得（RLS込み）
  const supabase = await getServerSupabase()

  // 3. 認可はRLSに委譲、ここでは書かない
  const { data, error } = await supabase
    .from('posts')
    .insert({ ...parsed.data })
    .select('id')
    .single()

  // 4. エラーは Result 型で返す（throw しない）
  if (error) {
    return { ok: false, error: mapSupabaseError(error) }
  }

  // 5. キャッシュ再検証
  revalidatePath('/me')
  revalidatePath(`/posts/${data.id}`)

  return { ok: true, data: { postId: data.id } }
}
```

## 設計原則

### 1. Result 型で戻り値を統一

```typescript
// types/result.ts
export type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E; details?: unknown }
```

- 例外を throw しない（Server Actions は `redirect()` 以外の throw を避ける）
- クライアント側で `.ok` で分岐しやすくする

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

### 3. Zodスキーマを共有

`lib/validators/posts.ts` に定義したスキーマを:
- Server Action の入力検証
- クライアントのフォームバリデーション（react-hook-form）
- テスト
の3箇所で共有する。

### 4. Supabase Client の切り替え

| 用途 | クライアント | 場所 |
|---|---|---|
| Server Components | Server Client | `lib/supabase/server.ts` |
| Server Actions | Server Client | 同上 |
| Route Handlers | Server Client | 同上 |
| Client Components（限定） | Browser Client | `lib/supabase/browser.ts` |
| Service Role が必要な処理 | Admin Client | `lib/supabase/admin.ts`（サーバー限定） |

**注意:**
- Service Role Client は**絶対にクライアントに送らない**
- ファイル冒頭に `import 'server-only'` を書いて誤 import を防ぐ

## テストしやすい設計

Server Actions は Supabase Client を注入可能に:

```typescript
// production
export async function createPost(input: unknown) {
  return createPostImpl(input, await getServerSupabase())
}

// testable
export async function createPostImpl(input: unknown, supabase: SupabaseClient) {
  // ... 実装
}
```

テストからは `createPostImpl` を呼び、モッククライアントを渡す。

## Route Handlers（`app/api/`）

### 実装対象

CLAUDE.md 掲載の4つのみ:

- `/api/auth/callback` — Supabase OAuth コールバック
- `/api/uploads/sign` — S3署名付きURL発行
- `/api/webhooks/consent` — 保護者同意リンク処理
- `/api/revalidate` — 手動 ISR

### 基本骨格

```typescript
// app/api/uploads/sign/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSupabase } from '@/lib/supabase/server'
import { getSignedUploadUrl } from '@/lib/s3'

const requestSchema = z.object({
  filename: z.string().max(255),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
})

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const { data: session } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = requestSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })
  }

  const { url, key } = await getSignedUploadUrl(parsed.data)
  return NextResponse.json({ url, key })
}
```

## 外部連携（S3, Google Maps, Google Business）

- 各外部SDKは `lib/{service}/` にラッパーを配置
- 環境変数は `lib/env.ts` で Zod 検証（型安全な読み出し）
- 失敗時のリトライ・タイムアウトを常に設定

```typescript
// lib/env.ts
import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  AWS_S3_BUCKET: z.string(),
  AWS_S3_REGION: z.string(),
  GOOGLE_MAPS_API_KEY: z.string(),
})

export const env = envSchema.parse(process.env)
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
- [ ] `revalidatePath` / `revalidateTag` を適切に呼んでいる
- [ ] `/self-review` を実行
- [ ] `/board-update` で実装状況ボードを更新

## やらないこと

- 独自認証システム（Supabase Auth のみ）
- Redis 等の追加インフラ（MVPは Postgres で完結）
- GraphQL サーバー（Supabase の PostgREST + RPC で足りる）
- 巨大な JOIN を Server Action に書く（Postgres 関数化する）
