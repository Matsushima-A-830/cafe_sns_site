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
  - `cafe-sns-dev` — Preview 用
  - `cafe-sns-prod` — Production 用
- **拡張の有効化（初期セットアップ）:**
  - `pgcrypto`（自動）
  - `citext`
  - `postgis`
  - `pg_trgm`
  - `pg_cron` — **Supabase Pro 以上でのみ利用可。MVP の Free 枠では使えない**。下書きの期限切れ削除は Edge Function + GitHub Actions の `schedule` で代替する（[pending-items A6](../product/pending-items.md)）

## CI/CD パイプライン

### GitHub Actions ワークフロー構成

`.github/workflows/` に配置:

| ファイル | トリガ | 内容 |
|---|---|---|
| `ci.yml` | PR / push | lint + typecheck + test + build |
| `e2e.yml` | PR | Playwright E2E |
| `migration-check.yml` | PR (supabase/migrations 変更時) | migration lint |
| `deploy-migration.yml` | main push (supabase/migrations 変更時) | prod DB migration 適用 |
| `preview-cleanup.yml` | PR close | Preview 環境のクリーンアップ（**未作成**） |

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
      - run: pnpm test:e2e
        env:
          BASE_URL: ${{ secrets.PREVIEW_BASE_URL }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

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
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      - run: supabase db push
```

**environment: production** の設定で **手動承認ゲート** を設ける（DB変更は必ず人間確認）。

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
| `AWS_S3_BUCKET` | △ | △ | △ | 画像バケット。**S3 を採用する場合のみ**（[pending-items A5](../product/pending-items.md) 未決） |
| `AWS_S3_REGION` | △ | △ | △ | 同上 |
| `AWS_ACCESS_KEY_ID` | △ | △ | △ | 同上 / Server-side only |
| `AWS_SECRET_ACCESS_KEY` | △ | △ | △ | 同上 / Server-side only |
| `RESEND_API_KEY` | ✕ | △ | ○ | 保護者同意メール等。本番は未成年フローに必須 |
| `SENTRY_DSN` | ✕ | △ | ○ | エラー通知 |

**AWS 系と Maps を必須にしない理由:** A5 が未決のうちに必須化すると、画像機能に触らない開発でも起動できなくなる。実際に使う箇所で「未設定なら機能を出さない」を判断する。

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
- **画像ストレージの正（S3 か Supabase Storage か）** — [pending-items A5](../product/pending-items.md) で決定。切替タイミングは Supabase Storage の帯域を見て判断
