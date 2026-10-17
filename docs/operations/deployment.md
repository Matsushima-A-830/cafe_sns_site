# デプロイ戦略

MVP から本番運用までのデプロイ・環境・監視・リリースフロー。

## フェーズ構成

| フェーズ | 期間目安 | 構成 |
|---|---|---|
| **フェーズ1（MVP）** | 開発〜PMF確認 | Vercel + Supabase Cloud |
| **フェーズ2（AWS移行）** | PMF後、スケール要求時 | AWS Amplify or CloudFront + Lambda |
| **フェーズ3（アプリ化）** | Web安定後 | React Native + 上記API |

**このドキュメントは主にフェーズ1を対象**とし、フェーズ2以降は方針のみ記載。

## 環境構成

3環境で運用:

| 環境 | 用途 | ドメイン | DB |
|---|---|---|---|
| **Local** | 開発マシン | `localhost:3000` | Supabase local (Docker) |
| **Preview** | PRごと自動生成 | `{branch}-cafe-sns-site.vercel.app` | Supabase Cloud (dev project) |
| **Production** | 本番公開 | 独自ドメイン（MVP前は Vercel サブ） | Supabase Cloud (prod project) |

**staging はスキップ** — Preview デプロイで代替。個人MVPには過剰。

### Local 環境

```bash
# 初回セットアップ
pnpm install
pnpm db:start          # Docker で Supabase 起動
pnpm db:reset          # マイグレーション + seed
pnpm dev               # http://localhost:3000
```

**要件:**
- Docker Desktop（Supabase local 用）
- Node.js 22 LTS
- pnpm

**認証まわりのローカル挙動:**
- `supabase/config.toml` の `site_url` は `http://localhost:3000`。**`.env.example` の `NEXT_PUBLIC_SITE_URL` と完全一致させること**（リダイレクト許可は完全一致判定なので、`127.0.0.1` と `localhost` の食い違いでコールバックが落ちる）
- `[auth.email] enable_confirmations = true`。サインアップの確認メールは **`http://localhost:54324`**（local_smtp の Web UI）で受け取る
- **WSL 上のリポジトリでは git 操作を WSL 側のシェルから行う**（Windows 側からだと lefthook が起動できず、検査が無音でスキップされる。[git-workflow.md](./git-workflow.md#git-hooks-lefthook)）

**Local `.env.local` の例:**

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<開発用キー>
AWS_S3_BUCKET=<S3採用時のみ。未設定なら Supabase Storage を使用 → pending-items A5 で決定>
SENTRY_DSN=<開発時は空でも可>
```

### Preview 環境

- **自動作成:** GitHub PR ごとに Vercel が自動デプロイ
- **URL:** PR ページに Vercel Bot がコメント
- **DB:** Supabase Cloud の **dev project** を共有（Preview 同士でデータ共有）
- **注意:** Preview は本番と切り分けたテストデータを使う

**Preview 環境で確認すべき項目:**
- モバイル・タブレット・PC の表示
- Chrome/Edge/Firefox の動作
- Server Actions の実挙動
- 認証フロー（Supabase Auth を dev project でテスト）

### Production 環境

- **デプロイ:** main プッシュで Vercel が自動デプロイ
- **DB:** Supabase Cloud の **prod project**
- **DBマイグレーション:** GitHub Actions で `supabase db push`（承認ゲート付き）
- **ロールバック:** Vercel Dashboard から前のデプロイをアクティブ化

## ホスティング詳細

### Vercel（Frontend）

- **プラン:** Hobby（無料）でスタート → 収益化決定時に Pro ($20/mo)
- **設定:**
  - Framework: Next.js
  - Node.js: 22.x
  - Root Directory: `./`
  - Build Command: `pnpm build`
  - Install Command: `pnpm install`
- **注意点（Hobby制限）:**
  - 商用利用不可（収益化前はOK、収益化開始でPro必須）
  - サーバレス関数実行時間 10秒
  - 帯域幅 100GB/月

### Supabase Cloud（Backend）

- **プラン:** Free（500MB DB, 1GB Storage, 50K MAU）でスタート → Pro ($25/mo)
- **プロジェクト構成:**
  - `cafe_sns_dev`（ref: `eqhblyqrmwnkuwgmfzfg`） — Preview 用。2026-09-12 作成、以後未使用で
    放置されていたが、2026-10-17 に Vercel `mitsu-cafe` の Preview 環境変数をこちらへ向けて
    実運用を開始した（[pending-items D72](../product/pending-items.md#d72-初回本番デプロイで判明したauth設定の本番非同期問題2026-10-15解消)参照）。
    マイグレーションは手動運用（`supabase link --project-ref eqhblyqrmwnkuwgmfzfg && supabase db push`）
  - `cafe-sns-prod`（ref: `ciasmmtrvlcokjmlwbsy`） — Production 用
- **拡張の有効化（初期マイグレーションに含める / 決定 2026-09-05）:**

  | 拡張 | 用途 |
  |---|---|
  | `pgcrypto` | `gen_random_uuid()`（Supabase では既定で有効） |
  | `citext` | `profiles.username` の大文字小文字を無視した一意性 |
  | `postgis` | `geography(POINT,4326)`（`cafes.location` / `areas.center_location`） |
  | `pg_trgm` | 日本語の部分一致検索（`posts.body_text` / `cafes.name_kana`）**— 検索の主役** |

  **`pgroonga` は導入しない。** 全文検索は `simple` tsvector + `pg_trgm` の2本立てとする（[data-model/tables.md #全文検索の方式](../architecture/data-model/tables.md#全文検索の方式決定-2026-09-05)）。

  **`pg_cron` は使わない。** Supabase Pro 以上でしか有効化できず、Free 前提のコスト見積りと両立しないため（下記「定期実行ジョブ」）。

- **Storage バケットの作成:** `post-images` / `cafe-images` / `avatars`（public）と `owner-documents`（private）。構成とパス規約は [data-model/README.md #ストレージ設計](../architecture/data-model/README.md#ストレージ設計)

### 定期実行ジョブ（`pg_cron` の代替 / 決定 2026-09-05）

**Supabase Edge Function を GitHub Actions の `schedule` から叩く方式に確定。** あわせて、取りこぼしても壊れないよう**参照時にも除外する**（二重の安全策）。

| ジョブ | 頻度 | 取りこぼし時の保険 |
|---|---|---|
| 期限切れ下書きの削除（`drafts.expires_at < now()`） | 日次 | 下書き一覧の取得クエリで `expires_at > now()` を必ず付ける |
| オーナー分析の Materialized View 更新 | 日次 | 最終更新時刻を画面に出す（古いデータと分かる状態にする） |

**GitHub Actions の `schedule` は実行が遅延・スキップされることがある**（混雑時、および60日間リポジトリ活動が無いと停止）。上の「保険」列を必ず併せて実装し、ジョブが動かなくても機能が壊れない状態を保つ。

ワークフローと Edge Function の実体は DB 実装フェーズで追加する。

## CI/CD パイプライン

### GitHub Actions ワークフロー構成

`.github/workflows/` に配置:

| ファイル | トリガ | 内容 |
|---|---|---|
| `ci.yml` | PR / push | lint + typecheck + ユニットテスト + build + commitlint（PRのみ） |
| `integration.yml` | PR / main push | Supabase を起動して `pnpm test:integration`（RLS 検証） |
| `e2e.yml` | PR / `workflow_call` | Playwright E2E。PR は Chromium 系のみ、webkit は `nightly.yml` と `safari` ラベル時 |
| `migration-check.yml` | PR (supabase/migrations 変更時) | migration lint |
| `deploy-migration.yml` | main push (supabase/migrations 変更時) | prod DB migration 適用（マスタデータもここに含まれる） |
| `nightly.yml` | schedule（週1）/ 手動 | Safari E2E・スキーマドリフト・ボードドリフト |
| `agent-review.yml` | PR（draft 以外） | エージェントによる差分レビュー。ブランチ保護が使えないため現状は助言役 |
| `agent-implement.yml` | issue に `agent:auto` ラベル | エージェントが実装して PR を立てる。**マージは人**。`AGENT_GITHUB_TOKEN` 未登録のため現在は停止中 |
| `preview-cleanup.yml` | PR close | Preview 環境のクリーンアップ（**未作成**） |

エージェント関連3本の設計・安全弁・課金分の実測は [agent-pipeline.md](./agent-pipeline.md) 参照。

**マスタデータ（areas / tags / badges）はマイグレーションに置く。`supabase/seed.sql` には置かない。**

マスタ3テーブルはアプリの動作に必須で、本番にも無いと画面が成立しない。一方 `seed.sql` は
`supabase db reset`（ローカル）でしか実行されず、本番の経路である `db push` は流さない。
**`db push --include-seed` も、未適用マイグレーションが0件だと seed をスキップする**ため、
マスタ単独の変更が本番に届かない（実測で確認済み）。

したがって:

| データ | 置き場 | 本番へ届く経路 |
|---|---|---|
| マスタ（areas / tags / badges） | `supabase/migrations/*_seed_master_data.sql` | `db push`（承認ゲート付き） |
| ローカル専用（開発用 admin、ダミー投稿など） | `supabase/seed.sql` | 届かない（届けない） |

**マスタを変更する時は既存ファイルを編集せず、新しいマイグレーションを追加する**（forward-only）。
`pnpm db:migrate:new add_xxx_tag` → `insert ... on conflict do update` を書く → PR。

**テストの実行経路が2つに分かれている理由:** `tests/integration/**` は実 Supabase を叩くため、
Docker を起動しない `ci.yml` では動かない。`vitest.config.ts` の `exclude` でユニット実行から外し、
Supabase を起動する `integration.yml` で `pnpm test:integration` として流す。
この分離をしないと、RLS テストを1本追加した時点で `ci.yml` が落ちる。

### `ci.yml` 例

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm lint:design   # デザインシステム禁止パターン検査
      - run: pnpm typecheck
      - run: pnpm test:run

  # 別ジョブで next build も実行する（実体は .github/workflows/ci.yml を参照）
```

### `e2e.yml` 例

```yaml
name: E2E
on: pull_request

jobs:
  playwright:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium webkit
      - run: pnpm build          # webServer が pnpm start を叩くため先にビルドが要る
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

**E2E は CI 内で自前のサーバーに対して実行する。** `playwright.config.ts` の `webServer` が `pnpm start` を起動するため、直前に `pnpm build` が必要。

- **`webServer` を CI で `undefined` にしない** — 誰も listen していない `localhost:3000` に接続しに行き、最初のテストを書いた瞬間に落ちる
- **`--pass-with-no-tests` は使わない** — テストが0件でもグリーンになり、CI の故障に気づけなくなる。最低1本のスモークテスト（`tests/e2e/smoke.spec.ts`）を常に置いておく
- Vercel Preview に対して流したい場合は `PLAYWRIGHT_BASE_URL` を渡す。設定されている時だけ `webServer` は起動しない

### DBマイグレーション自動適用

```yaml
name: Deploy Migration
on:
  push:
    branches: [main]
    paths: [supabase/migrations/**]

jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: production   # ← 承認ゲート
    steps:
      - uses: actions/checkout@v5
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      - run: supabase db push
```

**environment: production** の設定で **手動承認ゲート** を設ける（DB変更は必ず人間確認）。

> ⚠️ このサンプルは実ファイル [`.github/workflows/deploy-migration.yml`](../../.github/workflows/deploy-migration.yml) の要約。
> 齟齬が出たら実ファイルを正として、こちらを直す。

## 初回本番セットアップ時に Dashboard で手動設定が必要なもの（重要）

**`supabase/config.toml` の `[auth]` 系設定は `supabase db push`（マイグレーション適用）では
本番に一切同期されない。** `config.toml` はローカルの `supabase start` 専用の設定ファイルであり、
ホスティング先の Supabase Cloud プロジェクトには別途 Dashboard から手動で設定する必要がある
（2026-10-14 の初回デプロイで3箇所同時に踏んで判明）。

マイグレーション（テーブル・RLS・関数）は `db push` で届くが、**Auth の挙動設定は届かない**、
という区別を常に意識すること。初回セットアップ時は以下を**順番に**確認する:

| # | 設定項目 | config.toml の該当箇所 | Dashboard での設定先 |
|---|---|---|---|
| 1 | 確認メールのテンプレート（6桁コード） | `[auth.email.template.confirmation]` | Authentication → Emails → Templates → **Confirm sign up** |
| 2 | カスタムSMTP（Resendリレー） | （config.tomlには無い。本番専用設定） | Authentication → Emails → **SMTP Settings**。Host: `smtp.resend.com` / Port: `587` / Username: `resend` / Password: Resend API Key |
| 3 | Email OTP の桁数・有効期限 | `otp_length = 6` / `otp_expiry = 3600` | Authentication → Sign In / Providers → **Email** → Email OTP length / expiration |
| 4 | Site URL / Redirect URLs | `site_url` | Authentication → **URL Configuration**。本番URLに変更しないと `http://localhost:3000` のまま残る |
| 5 | Custom Access Token Hook | `[auth.hook.custom_access_token]` | Authentication → **Auth Hooks**（関数自体はマイグレーションで作成済みだが、Hookとしての登録は別） |

**カスタムSMTP未設定時の罠:** Supabase組み込みのメール送信は、未認証ドメイン（`onboarding@resend.dev`等）
からの送信だと「Resendアカウント登録メールアドレス宛にしか届かない」というResend側の制約がある。
**自分のメールアドレスでのテストだけでは気づけない。** 他人のメールアドレスで一度はテストすること。

**#5（Custom Access Token Hook）は特に見落としやすく、かつ最も実害が大きい。** 未登録のままだと
JWTに`onboarded`/`role`/`status`のクレイムが一切載らないため、**オンボーディングを完了した
ユーザーでも毎回`/onboarding/profile`へ差し戻される**（`profiles.onboarded_at`は正しく設定されて
いるのに、middlewareがJWTクレイムしか見ないため「未完了」と誤認する）。サインアップ〜メール確認
だけで満足せず、**オンボーディング完了後に`/me`へアクセスして正しくマイページが表示されるかまで
確認する**こと。設定を直した後は、該当ユーザーに再ログインしてもらう必要がある
（JWTは発行時点のクレイムを保持し続けるため、既存セッションには反映されない）。

**恒久対応の検討:** `deploy-migration.yml` に `supabase config push` ステップを追加すれば、
`config.toml` の変更も自動的に本番へ同期できる可能性がある（未検証。追加する場合は
Auth設定の意図しない上書きが無いか事前にdevプロジェクトで検証してから）。

## 本番の最初の admin を作る

`profiles.role` の変更は admin 限定（`is_admin()`）なので、本番には admin を作る経路が無い。
**最初の1人だけ service_role で手動昇格する**（pending-items A9）。

1. 対象ユーザーに通常どおりサインアップしてもらい、`profiles` 行まで作られた状態にする
2. Supabase Dashboard → SQL Editor（service_role 相当で実行される）で昇格する:

   ```sql
   update public.profiles set role = 'admin'
   where username = '<昇格させる username>';
   ```

3. **本人に再ログインしてもらう。** `role` は JWT のカスタムクレイムに載るため、
   既発行のアクセストークンが切れる（既定1時間）まで管理画面の導線が出ない

`profiles` の `guard_privileged_profile_columns` トリガーは `auth.uid()` が NULL のとき素通りするので、
この経路だけが通る。2人目以降は admin 自身が管理画面から昇格できる。

> **ローカルは手動昇格しなくてよい。** `supabase/seed.sql` が開発用 admin
> （`admin@example.test` / `password123`）を作る。この seed は `db reset` でしか流れないので
> 本番には入らない。

## 環境変数管理

### 一覧

凡例: ○ = 必須（未設定なら起動時に Zod が落とす） / △ = 任意（該当機能を使う時だけ） / ✕ = 不要

| 変数 | Local | Preview | Prod | 説明 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ○ | ○ | ○ | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ○ | ○ | ○ | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | ○ | ○ | ○ | Server-side only |
| `NEXT_PUBLIC_SITE_URL` | ○ | ○ | ○ | 自サイトURL（OG等） |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | △ | △ | △ | Maps API。S_MAP 実装までは未設定で動く |
| `AWS_S3_BUCKET` | ✕ | ✕ | ✕ | **MVP未使用**。画像は Supabase Storage（[pending-items A5](../product/pending-items.md) で決定）。S3 移行時に有効化 |
| `AWS_S3_REGION` | ✕ | ✕ | ✕ | 同上 |
| `AWS_ACCESS_KEY_ID` | ✕ | ✕ | ✕ | 同上 / Server-side only |
| `AWS_SECRET_ACCESS_KEY` | ✕ | ✕ | ✕ | 同上 / Server-side only |
| `RESEND_API_KEY` | ✕ | △ | ○ | 保護者同意メール等。本番は未成年フローに必須 |
| `SENTRY_DSN` | ✕ | △ | ○ | エラー通知 |

**AWS 系を optional のまま残す理由:** MVP では使わないが、S3 移行時に `lib/env.ts` を書き換えずに済むよう定義だけ残す。Maps は S_MAP 実装まで未設定で動かせるほうが都合がよいので optional のままにする。

### 管理方針

- **Local:** `.env.local`（gitignore）
- **Preview / Prod:** Vercel Dashboard で設定
- **Supabase:** Supabase Dashboard で設定（Edge Functions用）
- **秘密情報のオフライン保管:** 1Password / Bitwarden 等
- **絶対にコミット禁止** — Secret scanning + Push protection を有効化

### `lib/env.ts` で Zod 検証

**実装が正。** 以下は現在の [`lib/env.ts`](../../lib/env.ts) の写しであり、変更したらこの節も更新する。

```typescript
import { z } from 'zod'

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
})

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1).optional(),
  AWS_S3_REGION: z.string().min(1).optional(),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
})

export const env =
  typeof window === 'undefined'
    ? serverEnvSchema.parse(process.env)
    : publicEnvSchema.parse({
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
      })
```

**クライアント側で変数を1つずつ列挙している理由:** Next.js は `process.env.NEXT_PUBLIC_XXX` という**静的な参照**だけをビルド時に値へ置換する。ブラウザに `process.env` オブジェクトそのものは存在しないため、`publicEnvSchema.parse(process.env)` と書くと実行時に必ず落ちる。

**任意の変数を使う側の作法:** `env.AWS_S3_BUCKET` 等は `string | undefined` になる。使用箇所で未設定を検知したら、機能を出さないか `EXTERNAL_SERVICE_ERROR` を返す（[error-catalog](../architecture/error-catalog.md)）。`!` で握りつぶさない。

## DB マイグレーション運用

### 開発フロー

```bash
# 1. マイグレーションファイル作成
pnpm db:migrate:new create_regular_customers

# 2. 編集（supabase/migrations/{timestamp}_create_regular_customers.sql）

# 3. ローカル適用 & テスト
pnpm db:reset          # 完全リセット + seed
pnpm test              # 統合テストでRLSも検証

# 4. 型再生成
pnpm db:types

# 5. コミット
git add supabase/migrations/
git commit -m "feat: regular_customers テーブル追加"
```

### 本番適用フロー

1. PR で migration を含めて main にマージ
2. GitHub Actions が **承認待ち** に
3. 手動承認
4. `supabase db push` が本番へ適用
5. Vercel の app は既にデプロイ済み or 同時デプロイ

### ロールバック

- **Forward-only 原則** — 破壊的マイグレーションはしない
- 問題があれば **修正 migration を追加** して次リリース
- 緊急時のみ手動 SQL で対処、必ず記録

## 監視・アラート

### Sentry（エラー通知）

- **プラン:** Developer（無料、5K errors/mo）
- **設定:**
  - Server-side エラー（Server Actions, Route Handlers）
  - Client-side エラー（React error boundary）
  - パフォーマンス（Web Vitals）
- **アラート:**
  - 新規エラー
  - エラー頻度 (spike)
  - 特定エラーコード（`INTERNAL_ERROR`, `EXTERNAL_SERVICE_ERROR`）

### Vercel Analytics

- **プラン:** Hobby 無料枠
- **計測:**
  - リアルユーザーの Web Vitals（LCP, INP, CLS）
  - ページビュー・訪問者
- CLAUDE.md の Core Web Vitals 目標に対する実績確認

### Uptime Monitoring

- **サービス:** Better Stack 無料枠 or UptimeRobot
- **監視:**
  - `/` (トップページ) 5分間隔
  - Downtime 時は Sentry と別ルートで通知

### Supabase Dashboard

- DB使用量、Auth MAU、Storage 使用量を定期確認
- Free枠を超える前にPro移行判断

## ドメイン管理

### MVP開発中

- Vercel サブドメイン: `cafe-sns-site.vercel.app`
- Preview: 自動生成されたサブドメイン

### MVPリリース直前

**ドメイン取得:**
- **候補レジストラ:** Cloudflare Registrar（原価に近い価格、DNS も無料）or お名前.com
- **候補ドメイン:**
  - `<サービス名>.jp`
  - `<サービス名>.com`
  - `<サービス名>.cafe`
- **設定:**
  - Vercel の Domain 設定に追加
  - DNS: CNAME or A レコード
  - HTTPS: Vercel が自動発行 (Let's Encrypt)

### メール送信ドメイン

- 保護者同意メール等: `noreply@<domain>`
- Resend or SendGrid でSPF/DKIM/DMARC 設定

## リリース手順（毎回）

1. **PR作成 → CI 待ち → セルフレビュー**
2. **Preview で最終確認**（スマホ・タブレット・PC）
3. **main へ Squash Merge**
4. **Vercel が自動デプロイ**（1〜2分）
5. **DB マイグレーション含む場合、GitHub Actions で承認**
6. **本番で smoke test**（主要導線を1周）
7. **Sentry を10分監視**（エラーが上がっていないか）
8. **問題あれば即ロールバック**

## ロールバック手順

### Frontend

1. Vercel Dashboard → Deployments → 前の成功デプロイを開く
2. 「Promote to Production」

### DB マイグレーション

- Forward-only なので原則ロールバックしない
- 修正 migration を高速リリース
- どうしても戻す場合は 手動 SQL + 記録

## フェーズ2（AWS移行）方針

**移行トリガ:**
- Vercel Hobby → Pro への移行を検討する時点
- Supabase Free 枠を大幅に超える時
- 想定利用ユーザーが Vercel 帯域制限を超える時
- 独自の CDN 挙動が必要になった時

**移行候補構成:**

| レイヤー | 選択肢 |
|---|---|
| Frontend | AWS Amplify Hosting（Vercel互換に近い） / CloudFront + S3 + Lambda@Edge |
| Backend | Supabase継続（統合コスト小） / 自前 (Cognito + RDS + Lambda) |
| 画像 | S3 + CloudFront |
| DNS | Route 53 |
| メール | Amazon SES |
| 監視 | CloudWatch + Sentry |

**推奨判断基準:**
- **可能な限り Supabase を継続** — 移行工数を最小化
- **Frontend は Amplify に移行** — Vercel互換で移行コスト小

詳細な移行計画は PMF後に別途策定。

## コスト見積り（フェーズ1、月額）

| サービス | プラン | 月額 |
|---|---|---|
| Vercel | Hobby | $0 |
| Supabase | Free | $0 |
| Sentry | Developer | $0 |
| Google Maps Platform | 従量課金 | 〜$0-30 |
| ドメイン | Cloudflare Registrar | ~$10/年 |
| Uptime monitoring | Better Stack Free | $0 |
| **合計** | | **$0-30/月** |

**スケール時（Vercel Pro + Supabase Pro）:**
- Vercel Pro: $20/月
- Supabase Pro: $25/月
- Sentry Team: $26/月
- **合計: $70-100/月**

## 未決事項

- **BrowserStack 契約タイミング** — MVPリリース直前に1ヶ月分（[product/pending-items A1](../product/pending-items.md#a1-safari対応方針)）
- **メールサービス選定** — Resend / SendGrid 比較未実施（[product/pending-items B3](../product/pending-items.md#b3-保護者同意メールのテンプレート-送信基盤)）
- **AWS移行の具体構成** — フェーズ2で決定（[product/pending-items C1](../product/pending-items.md#c1-本番awsアーキテクチャ詳細)）
- **画像ストレージの S3 切替タイミング** — MVP は Supabase Storage に確定（[pending-items A5](../product/pending-items.md)）。**Free の 1GB に近づいたら**判断する。容量はダッシュボードで月1回確認する
