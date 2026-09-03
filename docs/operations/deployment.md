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
AWS_S3_BUCKET=<開発用バケット or 未設定でSupabase Storageを使用>
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
  - `pg_cron`（下書き自動削除用、Pro以上）

## CI/CD パイプライン

### GitHub Actions ワークフロー構成

`.github/workflows/` に配置:

| ファイル | トリガ | 内容 |
|---|---|---|
| `ci.yml` | PR / push | lint + typecheck + test |
| `e2e.yml` | PR | Playwright E2E |
| `migration-check.yml` | PR (supabase/migrations 変更時) | migration lint |
| `deploy-migration.yml` | main push (supabase/migrations 変更時) | prod DB migration 適用 |
| `preview-cleanup.yml` | PR close | Preview 環境のクリーンアップ |

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
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm biome ci
      - run: pnpm typecheck
      - run: pnpm test:run
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
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
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

| 変数 | Local | Preview | Prod | 説明 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ○ | ○ | ○ | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ○ | ○ | ○ | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | ○ | ○ | ○ | Server-side only |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ○ | ○ | ○ | Maps API |
| `AWS_S3_BUCKET` | ○ | ○ | ○ | 画像バケット |
| `AWS_S3_REGION` | ○ | ○ | ○ | |
| `AWS_ACCESS_KEY_ID` | ○ | ○ | ○ | Server-side only |
| `AWS_SECRET_ACCESS_KEY` | ○ | ○ | ○ | Server-side only |
| `SENTRY_DSN` | ✕ | ○ | ○ | エラー通知 |
| `NEXT_PUBLIC_SITE_URL` | ○ | ○ | ○ | 自サイトURL（OG等） |
| `RESEND_API_KEY` | ✕ | ○ | ○ | 保護者同意メール等 |

### 管理方針

- **Local:** `.env.local`（gitignore）
- **Preview / Prod:** Vercel Dashboard で設定
- **Supabase:** Supabase Dashboard で設定（Edge Functions用）
- **秘密情報のオフライン保管:** 1Password / Bitwarden 等
- **絶対にコミット禁止** — Secret scanning + Push protection を有効化

### `lib/env.ts` で Zod 検証

```typescript
import { z } from 'zod'

const publicEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
})

const serverEnv = publicEnv.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),
  AWS_S3_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  SENTRY_DSN: z.string().url().optional(),
  RESEND_API_KEY: z.string().optional(),
})

// 実行環境で切り分け（server-only import）
export const env = typeof window === 'undefined'
  ? serverEnv.parse(process.env)
  : publicEnv.parse(process.env)
```

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
- **CDN・画像配信の切替タイミング** — Supabase Storage の帯域を見て判断
