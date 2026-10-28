---

name: debug
description: 実装中の詰まり所を体系的に解消する。RLS、Server Actions、キャッシュ、型エラー、環境変数など。
---

# /debug — トラブルシュート手順

## 起動時に必ずやること

1. **症状を1文で言語化** — 「何をしたら」「何が起きて」「何を期待していたか」
2. **再現手順を最小化** — できるだけ短い操作列で再現できるか
3. **エラーメッセージを正確に写す** — スタックトレースはコピー漏れなく
4. **カテゴリを判定** → 以下の該当セクションへ

---

## カテゴリ1: RLS（Row Level Security）関連

### 症状: 「あるはずのデータが取れない」

**チェック順:**
1. Service Role ではなく **RLS が効くクライアント** で呼んでいるか
2. `auth.uid()` が期待するユーザーIDを返しているか

   ```sql
   -- Supabase Studio の SQL エディタで実行
   select auth.uid();
   ```
3. 対象テーブルのポリシーを確認

   ```sql
   select policyname, cmd, qual, with_check
   from pg_policies
   where schemaname = 'public' and tablename = 'posts';
   ```
4. **ポリシーを一時的に無効化して確認** — 権限が原因か、クエリの問題か切り分け

   ```sql
   -- 検証時のみ、本番禁止
   alter table public.posts disable row level security;
   -- テスト
   alter table public.posts enable row level security;
   ```
5. `explain analyze` でRLSが JOIN の中でどう展開されるか確認

### 症状: 「書き込みが `new row violates row-level security` で弾かれる」

1. **INSERT ポリシーの `with_check` を確認**
2. Zod で通していても DB 側で弾かれるパターン: `author_id` が `auth.uid()` と一致していない
3. Server Action で明示的に `author_id: session.user.id` をセットしているか

---

## カテゴリ2: Server Actions の異常挙動

### 症状: 「Server Action がクライアントで `undefined` を返す」

**チェック順:**
1. **`'use server'` ディレクティブがファイル冒頭にあるか**
2. Action が async 関数か（同期関数は Server Action にできない）
3. **`redirect()` を try/catch で握っていないか** — `redirect()` は throw されて Next.js に伝わる。catch すると挙動が壊れる
4. `revalidatePath` が正しいパスを指しているか（不要なキャッシュが残っている可能性）

### 症状: 「フォーム送信時に何も起きない」

1. `<form action={serverAction}>` の書き方が正しいか
2. `<button type="submit">` になっているか（デフォルトは submit だが `type="button"` になっていないか）
3. React 19 の `useActionState` を使う場合、hook の場所が Client Component 内か

### 症状: 「クライアントエラー: `Only plain objects can be passed to Server Actions`」

1. Server Actions に **クラスインスタンス・関数・Date オブジェクト** を渡していないか
2. `Date` は ISO 文字列 or unix time に変換して渡す
3. `File`/`FormData` は許可（Next.js が特別扱い）

---

## カテゴリ3: Next.js キャッシュ問題

### まず前提を疑う: このプロジェクトの閲覧系ページはキャッシュされていない

`/` `/explore` `/posts/[id]` `/users/[username]` `/cafes/[id]` `/me` はすべて `auth.getUser()` で
cookie を読む**動的レンダリング**で、フルルートキャッシュに載っていない（[pending-items D23](../../../docs/product/pending-items.md)）。
`pnpm build` の出力で `ƒ (Dynamic)` になっていることを確認できる。

したがって **「古いデータが出る」の原因がサーバー側のキャッシュであることは、まず無い。**
`revalidatePath` を足して直そうとするのは誤った方向で、実際のコードでも1箇所も呼んでいない。

### 症状: 「更新したのに古いデータが表示される」

**チェック順:**
1. `pnpm build` でそのルートが `ƒ (Dynamic)` か `○ (Static)` かを確認する。`ƒ` ならサーバー側のキャッシュは無関係
2. **Client Component の state が古いままではないか** — 最有力。`useState` の初期値はサーバーから
   新しい props が来ても更新されない。`router.refresh()` はサーバーを再描画するが**子の state は捨てない**
   - 対処: 値が変わったら作り直したい要素に `key={...}` を付ける（`PostFeed` / `FollowButton` が実例）
3. Router Cache（クライアント側のナビゲーション履歴）→ `router.refresh()`
4. `next dev` のビルドキャッシュ → 後述の「ブランチを切り替えたら `.next` を消す」

### 症状: 「本番ビルドで動作が変わる」

1. `next dev` は毎回SSRだが、`next build` は静的化される場合あり
2. `cookies()` `headers()` `auth.getUser()` を呼ぶと自動的に dynamic になる
3. **動的セグメント（`[id]`）のルートは `generateStaticParams` が無いと `revalidate` を置いても
   フルルートキャッシュに載らない** — D23 に実測の切り分けがある

---

## カテゴリ4: TypeScript 型エラー

### 症状: 「Supabase の型が `never` になる」

1. `pnpm db:types` を再実行（`types/database.ts` が古い）
2. Supabase Client を型付きで初期化しているか

   ```typescript
   createClient<Database>(url, key)  // ← <Database> ジェネリクス必須
   ```

### 症状: 「`Property 'X' does not exist on type 'Y'`」

1. 型定義を **辿る** — `Ctrl+Click` or Grep で実体を追う
2. `unknown` から絞り込む場合、Zod でパースするか `in` オペレータでナローイング
3. Optional chain (`?.`) を使いすぎていないか（型で表現すべき箇所）

### 症状: 「`any` に落ちてしまう」

1. `as any` を安易に使わない
2. まず `unknown` として受け、Zod でパース
3. 外部ライブラリの型が甘い場合 → `@types/*` を追加 or 独自 declaration

---

## カテゴリ5: Supabase 環境問題

### 症状: 「ローカル Supabase に接続できない」

1. `pnpm db:start` が正常終了しているか（Docker Desktop 起動確認）
2. `.env.local` の URL が `http://127.0.0.1:54321` になっているか
3. ポート衝突していないか (`lsof -i :54321`)

### 症状: 「Supabase Auth のセッションが取れない」

1. `NEXT_PUBLIC_SUPABASE_ANON_KEY` が正しいか
2. Cookie の domain が localhost の場合、`sameSite: 'lax'` になっているか
3. サーバー側で `createServerClient` を使い、cookies を渡しているか（Client用と別）

### 症状: 「Storage の署名URLが弾かれる」

1. バケットが `public` か `private` か
2. RLS ポリシーが Storage 側にも設定されているか
3. 署名URL の有効期限内か

---

## カテゴリ6: 環境変数 / 設定

### 症状: 「`process.env.X` が undefined」

1. **サーバー変数**か **公開変数** (`NEXT_PUBLIC_*`) か
2. `.env.local` を保存後、`pnpm dev` を再起動したか
3. `lib/env.ts` の Zod スキーマに追加しているか

### 症状: 「ビルド時のみエラー」

1. `NEXT_PUBLIC_*` 以外の変数を Client Component で参照していないか
2. Vercel/AWS 側にも同じ変数を設定したか

---

## カテゴリ7: Tailwind / スタイル

### 症状: 「クラスが効かない」

1. **タイポ確認** — Tailwind Intellisense が候補を出すか
2. `tailwind.config.ts` (v3) or `@source` (v4) にファイルパスが含まれているか
3. 動的クラス（`bg-${color}-500`）は JIT が検出できない → 完全クラス名を書く or `safelist` に追加
4. デザインシステム違反で意図しない色 → [design-system.md](../../../docs/design/design-system.md) を確認

### 症状: 「shadcn/ui コンポーネントの色が違う」

1. `app/globals.css` の CSS 変数が brown/cream トークンにマッピングされているか
2. dark モード時の変数も定義しているか
3. `data-theme` attribute の有無

---

## カテゴリ8: Playwright E2E

### 症状: 「全テストが一斉に落ちる」（smoke まで落ちたら実装を疑わない）

1. **Playwright を bump した直後か** — `@playwright/test` のバージョンが上がるとブラウザ本体の
   ビルド番号も変わり、ローカルの `~/.cache/ms-playwright` に無いものを起動しようとして落ちる。
   `Executable doesn't exist at .../chromium_headless_shell-XXXX/...` が目印。
   対処: `pnpm exec playwright install chromium`（CI はキャッシュキーに `pnpm-lock.yaml` の
   ハッシュを含むので自動で入れ直される）
2. ローカル Supabase が落ちていないか — `pnpm db:start`
3. dev サーバーが起動できているか — `[WebServer]` の出力を読む

### 症状: 「ローカルで通るが CI で落ちる」

1. **WebKit だけ落ちる** — ローカルに webkit / mobile-safari のブラウザ本体が入らない
   （`playwright install webkit` が OS ライブラリ不足で失敗する）ため、CI で初めて出る。
   典型は**書き込みの完了を待たずに `page.reload()` や画面遷移をしている**ケースで、
   Chromium は間に合ってしまい WebKit だけ取りこぼす（`/test` の「状態が変わるまで待つ」参照）
2. タイミング依存 — `await expect(...)` の自動リトライを使い、`sleep` は禁止
3. 環境変数の差（テスト用DB）
4. フォント差でスクリーンショット比較が失敗 → フォントを固定 or 比較無効化

### 症状: 「テストは通るのにDBに行が残る」

前提データを `Promise.all` で並列に作っていないか。**片方の作成が失敗するともう片方が
孤立して残る**（登録前に例外が飛ぶため後片付けの対象にならない）。作った端から
クリーンアップ対象に登録する。

### 症状: 「セレクタが特定できない」

1. `data-testid` を実装側に追加
2. `getByRole` `getByLabel` を優先（アクセシビリティも改善）

---

## カテゴリ9: 一般的な詰まり所

### エラーが空・分からない

1. **開発者ツールの Network タブ** で Server Action の response を見る
2. **サーバーログ** (`pnpm dev` のターミナル) を確認
3. Sentry に飛ばしている場合はダッシュボード確認
4. **早期リターンで console.log 挿入**（デバッグ後は削除）

### 「動くはずのコードが動かない」

1. **本当にそのコードが実行されているか** — 冒頭に `console.log` を仕込んで確認
2. **ブランチが正しいか** — `git status` `git log --oneline -5`
3. **ビルドキャッシュ** — `.next/` を削除して再ビルド

---

## デバッグの原則

- **仮説を1つずつ検証** — 複数変更を同時にしない
- **最小再現コード** を作れれば9割解決
- **AI（Claude Code）に相談する時は「試したこと」を先に伝える** — 同じ手を繰り返さない
- **解決したら理由を1行メモ** — 次に同じ問題に遭遇した時のため
- **根本原因が不明なまま `try/catch` で握らない** — バグを隠すだけ

## 未解決時のエスカレーション

1. GitHub Issues に再現手順付きで報告
2. Supabase Discord / Next.js GitHub Discussions
3. Stack Overflow — ただし古い情報が多いので日付確認

## 学習の記録

繰り返し発生する問題は [pending-items.md](../../../docs/product/pending-items.md) に「解消済みの罠」として記録する。

## `config.toml` を変えたのに反映されない

`pnpm db:reset` は**マイグレーションと seed を流し直すだけで、`config.toml` は読み直さない。**
Auth のフック設定（`[auth.hook.custom_access_token]`）など、コンテナの起動設定を変えた時は
`pnpm db:stop && pnpm db:start` が要る。

症状: フックを有効化したのに JWT のカスタムクレイム（`role` / `status` / `onboarded`）が載らない。

## ブランチを切り替えたら `.next` を消す

Next.js は App Router のルート型を `.next/types/validator.ts` と `.next/dev/types/validator.ts` に
**生成する**が、これらはブランチ切り替えで消えない。別ブランチにしか無いページを参照したまま残るため、
そのページが存在しないブランチで型チェックが落ちる。

```
.next/types/validator.ts(152,39): error TS2307:
  Cannot find module '../../app/(browsing)/cafes/[id]/page.js' or its corresponding type declarations.
```

症状: **自分の変更と無関係なファイルで `tsc` が落ちる。** pre-push hook（`pnpm typecheck`）で
push が拒否される形で表面化することが多い。

対処: `rm -rf .next`（`.gitignore` 済みのビルド成果物なので消して問題ない）。
`--no-verify` で hook を回避しないこと — この現象は環境側の問題だが、回避すると本物の型エラーも素通りする。
