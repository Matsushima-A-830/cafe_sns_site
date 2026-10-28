# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際の常時参照コンテキスト。作業前に必ず該当セクションを確認する。

## プロジェクト概要

**目的:** カフェで交流するためのSNSサイト。行動経済学の考え方を意識したUI/UXで、日本の10〜20代（メインターゲット）とカフェ経営者（サブターゲット）に届ける。
- **公開計画:** AWSでブラウザ版先行 → アプリ化検討
- **対応端末:** スマホ / タブレット / PC すべて最適化
- **対応ブラウザ:** Chrome, Edge, Firefox（Safariは MVP開発期間中は非対応、リリース前に集中検証）
- **Safari互換コーディング必須:** 開発期間中は Safari 互換を常に意識する（`-webkit-` プレフィックス、`100vh` iOS挙動、date input差異、`backdrop-filter` 等）。詳細は memory `project-safari-pending` 参照

## 設計ドキュメントの起点

**実装前に必ず参照する。単一の情報源はドキュメント側であり、コードで齟齬が出た場合はドキュメント優先で議論する。**

| カテゴリ                      | パス                                                                             | 用途                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 索引                          | [docs/README.md](docs/README.md)                                                 | 全ドキュメントの索引                                                               |
| **product / 戦略**            | [docs/product/positioning.md](docs/product/positioning.md)                       | **差別化戦略の幹（気分検索・オーナー連携）— 判断の起点**                           |
| product / スコープ            | [docs/product/mvp-scope.md](docs/product/mvp-scope.md)                           | 機能の実装優先度・後回し判断                                                       |
| product / TODO                | [docs/product/pending-items.md](docs/product/pending-items.md)                   | 優先度別TODO                                                                       |
| architecture / データモデル   | [docs/architecture/data-model/README.md](docs/architecture/data-model/README.md) | ER図・設計方針・RLS方針                                                            |
| architecture / テーブル       | [docs/architecture/data-model/tables.md](docs/architecture/data-model/tables.md) | 列・制約・RLSポリシー                                                              |
| architecture / ルーティング   | [docs/architecture/routing.md](docs/architecture/routing.md)                     | App Router・middleware・SEO                                                        |
| architecture / エラー         | [docs/architecture/error-catalog.md](docs/architecture/error-catalog.md)         | Result型エラーコード                                                               |
| design / 画面遷移             | [docs/design/screen-flow.md](docs/design/screen-flow.md)                         | Mermaidフロー6種                                                                   |
| design / ワイヤー             | [docs/design/wireframes/README.md](docs/design/wireframes/README.md)             | 37画面のモバイル/PCレイアウト                                                      |
| **design / デザインシステム** | [docs/design/design-system.md](docs/design/design-system.md)                     | **余白/色/サイズ・brown系（実装時必読）**                                          |
| **operations / 開発サイクル** | [docs/operations/development-cycle.md](docs/operations/development-cycle.md)     | **スキルを使った1周の順序と理由（着手判断→実装→レビュー→実機確認→出荷→引き継ぎ）** |
| **operations / Git**          | [docs/operations/git-workflow.md](docs/operations/git-workflow.md)               | **ブランチ・コミット・PR規約（実装時必読）**                                       |
| **operations / デプロイ**     | [docs/operations/deployment.md](docs/operations/deployment.md)                   | **環境・CI/CD・監視（実装時必読）**                                                |
| operations / エージェント     | [docs/operations/agent-pipeline.md](docs/operations/agent-pipeline.md)           | 無人実行（nightly）・自動レビュー・無人マージのステージと安全弁                    |
| seed / バッジ                 | [docs/seed/badges-initial-set.md](docs/seed/badges-initial-set.md)               | 20バッジの条件定義                                                                 |
| seed / タグ                   | [docs/seed/curated-tags-initial-set.md](docs/seed/curated-tags-initial-set.md)   | 厳選タグ30個                                                                       |
| seed / エリア                 | [docs/seed/areas-initial-set.md](docs/seed/areas-initial-set.md)                 | 東京45エリア                                                                       |
| **ユビキタス言語**            | [docs/glossary.md](docs/glossary.md)                                             | **日本語UI↔英語コード対応（実装時必読）**                                          |

**画面ID (`S_*`)** は上記ドキュメント間で一貫している。実装時は `page.tsx` の冒頭コメントに対応する画面IDを記載してトレーサビリティを保つ。

## 技術スタック

| レイヤー                 | 採用                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ランタイム               | Node.js 22 LTS                                                                                                                                                                              |
| パッケージマネージャ     | pnpm                                                                                                                                                                                        |
| フレームワーク           | Next.js 16 (App Router)                                                                                                                                                                     |
| 言語                     | TypeScript (strict)                                                                                                                                                                         |
| スタイル                 | Tailwind CSS + shadcn/ui                                                                                                                                                                    |
| リッチテキスト           | Tiptap（JSON保存）                                                                                                                                                                          |
| バックエンド             | Supabase（Auth / Postgres / Storage / Realtime）                                                                                                                                            |
| 画像配信                 | **MVP: Supabase Storage + Next/Image**（本格展開時に AWS S3 + CloudFront へ移行。[pending-items A5](docs/product/pending-items.md) で決定済）。読み書きは必ず `lib/storage/` のラッパー経由 |
| 地図                     | Google Maps Platform                                                                                                                                                                        |
| 検索                     | Postgres の `simple` tsvector + **`pg_trgm`**（日本語の部分一致はこちらが主役）。`pgroonga` は導入しない（[tables.md #全文検索の方式](docs/architecture/data-model/tables.md)）             |
| ホスティング（開発）     | Vercel                                                                                                                                                                                      |
| ホスティング（本番想定） | AWS（詳細は [product/pending-items.md](docs/product/pending-items.md) C1）                                                                                                                  |

## 実装ツーリング

| 用途                 | ツール                         |
| -------------------- | ------------------------------ |
| ユニットテスト       | Vitest                         |
| コンポーネントテスト | Vitest + React Testing Library |
| E2Eテスト            | Playwright                     |
| Lint + Format        | Biome                          |
| 型チェック           | tsc --noEmit（CIで実行）       |
| Git hooks            | lefthook（Windowsフレンドリ）  |
| DBマイグレーション   | Supabase CLI                   |

## 開発哲学

### 1. TDDを主軸に

**コアロジック（Server Actions・API・バリデーション・DB関連）は必ずテストを先に書く。**
- **Red:** 失敗するテストを書く（意図の記述）
- **Green:** 最短で通す実装（"just enough" の原則）
- **Refactor:** 設計を整える（テスト緑を維持しながら）

UIコンポーネントのピクセルいじり・スタイル微調整は、動作確認後の Testing Library テストで代替可。

詳細は `/test` スキルを参照。

### 2. 拡張性・変更容易性を優先

- **境界を明示する:** ドメインロジックとフレームワーク依存を分離。Supabaseクライアントは薄いラッパー越しに使い、将来のAWS移行に備える
- **単一責任原則:** 1ファイル1関数の粒度は問わないが、責務が混ざったら分割する
- **依存性の注入:** Server Actions はテストしやすいよう、Supabaseクライアントを引数化 or DI する設計を選ぶ
- **enumやマジック文字列は集約:** `types/` or `constants/` に集約し、直書き禁止
- **DBスキーマ変更は必ずマイグレーション経由**（本番一致を保証するため）

### 3. バグの少ない実装

- **TypeScript strict モード** を厳守。`any` 禁止、`unknown` 経由でナローイング
- **Zod でスキーマバリデーション** — 境界（Server Actions入力、API受信、外部API応答）は必ずZodで検証
- **RLSに認可を委譲** — アプリ層で認可を書かず、SupabaseのRLSに任せる。Server Actionsは入力バリデーションのみ
- **早期リターン** — ネスト深いif/elseを避ける
- **例外は境界で握る** — Server Actions・API Routesの境界で捕捉し、それ以外は握らない（暗黙握りでバグ隠蔽NG）

### 4. 過剰設計を避ける

- 将来の可能性のための抽象化はしない。3回同じパターンが出てから抽象化を検討
- 使われない設定オプション・フックポイントは作らない

### 5. コメント規約

- **1〜2行が基本**、3行以上は例外。書くなら箇条書きで整理する
- **端的に、初見者でも1回読めば理解できる** 表現にする
- **「なぜ」を書く**。「何を」はコード自身が語る（`// カウントを1増やす` は禁止）
- **冗長な説明・自明な情報を排除**（型定義に書いてある情報を再説明しない）
- **TODO/FIXME は理由と担当を書く** — `// TODO: 保護者同意メール未実装 (pending-items B3)`

#### 良い例

```typescript
// 楽観更新: 失敗時に元に戻すため initial 値を保持
const [liked, setLiked] = useState(initialLiked)

// pending_consent 中は投稿不可（RLSで弾かれるが早期リターン）
if (profile.status !== 'active') return { ok: false, error: 'FORBIDDEN' }
```

#### 悪い例

```typescript
// この関数はユーザーがいいねボタンを押したときに呼ばれます。
// まず現在の状態を取得して、それを反転させ、
// APIを呼び出して結果を反映します。もしAPIが失敗した場合は、
// 元の状態に戻す必要があります。なぜなら楽観更新をしているからです。
function handleLike() { ... }
```

冗長・自明・改行過多。関数名と型で伝わる情報は書かない。

## ディレクトリ構造（想定）

```
cafe_sns_site/
├── CLAUDE.md
├── .claude/
│   └── skills/<name>/SKILL.md     # /test /fe-implement 等のスキル
├── docs/                          # 設計ドキュメント（真実の源泉）
├── app/                           # Next.js App Router（[docs/architecture/routing.md] 参照）
│   ├── (browsing)/
│   ├── (auth)/
│   ├── (user)/
│   ├── (owner)/
│   ├── (admin)/
│   ├── _actions/                  # Server Actions（機能単位で分割）
│   └── api/                       # Route Handlers
├── components/
│   ├── ui/                        # shadcn/ui の自動生成先
│   └── features/                  # 機能別カスタムコンポーネント
├── lib/
│   ├── supabase/                  # Supabase Client ラッパー
│   ├── validators/                # Zodスキーマ
│   ├── constants/                 # enum・マジック文字列
│   └── utils/                     # 汎用ユーティリティ
├── types/                         # 共有型定義
├── tests/
│   ├── unit/                      # Vitest
│   ├── integration/               # Server Actions + Supabase
│   └── e2e/                       # Playwright
├── supabase/
│   ├── migrations/                # SQL migration ファイル
│   ├── seed.sql                   # ローカル専用データのみ（本番には届かない）
│   └── config.toml
└── public/                        # 静的アセット
```

## 主要コマンド

```bash
pnpm dev              # 開発サーバー起動 (http://localhost:3000)
pnpm build            # プロダクションビルド
pnpm start            # 本番サーバー起動

pnpm test             # Vitest（watch モード）
pnpm test:run         # Vitest（CI用、1回実行）
pnpm test:coverage    # Vitest + カバレッジ
pnpm test:e2e         # Playwright
pnpm test:e2e:ui      # Playwright UIモード

pnpm lint             # Biome check
pnpm lint:design      # デザインシステム禁止パターン検査（#000・インラインstyle・非8倍数余白）
pnpm lint:fix         # Biome check --write
pnpm format           # Biome format --write
pnpm typecheck        # tsc --noEmit

pnpm db:start         # ローカルSupabase起動
pnpm db:stop          # ローカルSupabase停止
pnpm db:migrate:new   # マイグレーションファイル作成
pnpm db:migrate       # マイグレーション適用 (supabase db push)
pnpm db:reset         # DB初期化 + seed
pnpm db:diff          # スキーマ差分の確認
pnpm db:types         # supabase gen types typescript
```

## ファイル・命名規約

- **ルートPage:** `app/**/page.tsx` — 冒頭に `// S_XXX` の画面ID コメントを付ける
- **Server Actions:** `app/_actions/{feature}.ts` — 'use server' ディレクティブ
- **クライアントコンポーネント:** `'use client'` を明示、`components/features/{feature}/` に配置
- **Zodスキーマ:** `lib/validators/{feature}.ts` — export 名は `xxxSchema`
- **型:** `types/{feature}.ts` — DB型は `supabase gen types` で自動生成した `types/database.ts` から派生
- **テスト:** 実装ファイルと同ディレクトリに `xxx.test.ts`（ユニット）、`tests/e2e/` に `xxx.spec.ts`（E2E）

## デザインシステム（必須ルール）

**詳細は [docs/design/design-system.md](docs/design/design-system.md)。UIを触るすべてのファイルで遵守する。**

### 4つの厳守ルール

1. **余白は 8px の倍数**（Tailwind: `0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, ...`）
   - **例外許可:** 4px (`p-1`) / 12px (`p-3`)
   - **禁止:** `p-5`(20px), `p-7`(28px), `p-9`(36px), `p-11`(44px) 等の非8倍数
   - **任意値禁止:** `p-[13px]` のような小数点・非8倍数の任意値
2. **サイズは整数** — `text-[15px]` のような小数点/非標準サイズ禁止。Tailwind標準の `text-xs/sm/base/lg/xl/2xl/3xl/4xl` を使う
3. **カラーはブラウン系メイン** — `brown-50` 〜 `brown-900` の10段階を定義
4. **`#000000` 系は絶対使わない** — `text-black`, `bg-black`, `#000`, `#000000`, `black/50` などすべて禁止。テキストは `text-brown-900` を使用

### CSSは Tailwind のみ

- インライン `style={}` 禁止
- CSS Modules / styled-components 禁止
- グローバルCSSは `app/globals.css` に `@theme` 定義のみ

### セマンティックトークンを優先

`brown-500` などの具体色を直接使わず、意味論トークンを使う:

```
bg-background       (ページ背景)
bg-surface          (カード背景)
text-foreground     (主要テキスト・#000代替)
text-muted-foreground (副情報テキスト)
bg-primary          (主要ボタン)
text-primary-foreground (ボタン上のテキスト)
border-border-default (標準ボーダー)
ring-ring-focus       (フォーカスリング)
bg-danger           (危険操作)
```

具体色（`bg-brown-500` 等）を直接使うのは、意味論で表現できない特殊ケースのみ。詳細は [design/design-system.md #セマンティックトークン](docs/design/design-system.md#セマンティックトークン推奨-この命名で使う) 参照。

### 禁止パターンの自動検出

`scripts/check-design-system.sh` が以下を検出する。**CI（`ci.yml`）と pre-commit hook の両方で実行される**ため、違反はコミットできない。

| 検出内容             | 例                                                        |
| -------------------- | --------------------------------------------------------- |
| `#000` 系の色        | `text-black` `bg-black` `black/50` `#000` `#000000`       |
| インライン style     | `style={`                                                 |
| 非8倍数の余白        | `p-5` `md:mt-7` `gap-9`（`h-5 w-5` 等のサイズ系は対象外） |
| 余白の任意値         | `p-[13px]` `gap-[13px]`                                   |
| フォントの任意サイズ | `text-[15px]`                                             |

手元での実行は `pnpm lint:design`。

## 決定事項サマリ（横断ルール）

- **お気に入り / 行きたい / 保存 / 下書き:** 4カードショートカット + タブ切替プレビューのハイブリッドUI
- **ブログエディタ:** Tiptap（JSON保存）、機能は見出し/太字/斜体/リンク/画像/引用/リストに限定
- **バッジ:** MVP 20個（[docs/seed/badges-initial-set.md](docs/seed/badges-initial-set.md)）
- **オーナー認証書類:** 5種類から2点以上を選択
- **タブレット:** PC寄せ + 一部モバイル要素（`md:` タブレット / `lg:` PC / `xl:` 贅沢）
- **年齢確認:** 生年月日必須。<13歳ブロック、13〜17歳は保護者同意フロー
- **下書き自動保存:** 15秒デバウンス、`drafts` テーブル、30日で expire

## 使えるスキル

`/{skill}` で呼び出し可能。実体は `.claude/skills/<name>/SKILL.md`（フラットな `.md` は認識されない）。
**どのスキルをどの順で走らせるかは [docs/operations/development-cycle.md](docs/operations/development-cycle.md)**:

| コマンド            | 用途                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `/test`             | TDDワークフロー、テスト設計の指南                                                              |
| `/fe-implement`     | フロントエンド実装（ページ・コンポーネント）                                                   |
| `/be-implement`     | バックエンド実装（Server Actions・API Routes）                                                 |
| `/db-implement`     | DB実装（マイグレーション・RLS）                                                                |
| `/self-review`      | 実装後のセルフレビュー（組み込み `/code-review` とは別物）                                     |
| `/debug`            | RLS/Server Actions/キャッシュ/型エラー等の解消手順                                             |
| `/board-update`     | 実装状況ボード（docs/implementation-board.html）の更新                                         |
| `/dashboard-update` | Obsidian個人開発ダッシュボード・実装履歴の更新（リポジトリ外、PRマージ後）                     |
| `/handoff`          | 次セッションへの引き継ぎテキスト生成（マージ後・セッションを切る直前）                         |
| （`supabase`）      | Supabase 一般知識。スラッシュ起動ではなく内容に応じて自動発動。上流 supabase/agent-skills 由来 |

**組み込みスキルとの併用:** `/code-review`（差分レビュー、`ultra` でクラウド多エージェント）・`/security-review`・`/run` も利用可。
`docs/` 内の過去ログにある `/code-review` は、2026-09-16 の改名前の本プロジェクトスキル（現 `/self-review`）を指す。

## Git / デプロイ運用

**詳細は [docs/operations/git-workflow.md](docs/operations/git-workflow.md) / [docs/operations/deployment.md](docs/operations/deployment.md) 参照。**

### 常時遵守ルール

- **リポジトリ:** GitHub プライベート、デフォルトブランチ `main`
- **ブランチモデル:** GitHub Flow（`main` + `feature/*` `fix/*` `refactor/*` `docs/*` `chore/*`）
- **コミット:** Conventional Commits 日本語（`feat: xxx` `fix: xxx` 等）
- **マージ:** Squash Merge のみ、main へ直接 push 禁止
- **main はデプロイ可能な状態を常に保つ**
- **`.env*` は絶対にコミットしない**

### 環境

- **Local:** `pnpm dev` + Supabase local (Docker) — `localhost:3000`
- **Preview:** Vercel が PR ごと自動デプロイ
- **Production:** main プッシュで Vercel + Supabase Cloud に自動デプロイ

### DB マイグレーション

- 必ず `supabase/migrations/` にファイル追加、PR に含める
- 本番適用は GitHub Actions の **承認ゲート** 経由
- Forward-only 原則、ロールバック用SQLは書かない

### Claude Code と作業する際のGit運用

- **ブランチ切り替え、PR作成、コミットは必ずユーザー確認を経る**
  （例外は CI 上の `agent-implement.yml` のみ。下記「無人パイプラインの例外」参照）
- **破壊的操作**（force push, hard reset, branch削除等）は指示なしにやらない
- pre-commit hook 失敗時は `--no-verify` で回避せず、根本を直す
- コミットメッセージには `Co-Authored-By: Claude ...` を付与

#### 無人パイプラインの例外

`agent-implement.yml` は issue への `agent:auto` ラベルを起点に、人の逐次確認なしで
コミット・ブランチ作成・PR作成を行う。上の「必ずユーザー確認を経る」は
このワークフローには適用されない。

**ただしマージは常に人が行う。無人マージは実装していない。**
GitHub Free のプライベートリポジトリではブランチ保護・ルールセット・auto-merge が
いずれも使えず、必須ステータスチェックに守られない自動マージは成立しないため。

代わりに次で担保する。詳細は
[docs/operations/agent-pipeline.md](docs/operations/agent-pipeline.md)。
- 起動できるのは OWNER / MEMBER / COLLABORATOR がラベルを付けた issue だけ
- エージェントに任せる範囲は `scripts/check-agent-scope.sh` で制限（現在は `docs/` のみ）
- `.github/` `lefthook.yml` `scripts/check-*` `supabase/migrations/` `package.json`
  `CLAUDE.md` は常時禁止。**エージェントが自分を止める仕組みと本ファイルを変更することはない**
- 作られた PR には `agent:needs-review` が付く。人が差分を見てマージする

**対話セッションの Claude Code（このファイルを読んでいる側）にこの例外は適用されない。**
手元での commit / push / PR 作成は、これまでどおり毎回ユーザー確認を経ること。

## アクセシビリティとパフォーマンス

MVPリリース時点で以下の基準を満たすことを目標にする。

### アクセシビリティ (WCAG 2.1 AA)

- **セマンティックHTML** — `div` の乱用禁止。`nav` `main` `article` `section` `header` `footer` を使う
- **キーボード操作** — すべてのフォーム・ボタン・リンクが Tab で辿れる
- **フォーカスリング** — `focus-visible:ring-2 focus-visible:ring-ring-focus` を必ず適用
- **代替テキスト** — 画像は `alt` 必須。装飾のみなら `alt=""`
- **ラベル** — `<input>` には必ず対応する `<label>` or `aria-label`
- **コントラスト比** — テキストは 4.5:1 以上（`text-foreground` on `bg-background` は準拠）
- **動きの配慮** — `prefers-reduced-motion` に対応、大きな自動再生アニメを避ける
- **エラー通知** — `aria-live="polite"` でスクリーンリーダーに伝える

### パフォーマンス (Core Web Vitals)

| 指標                                | 目標    | 意味                     |
| ----------------------------------- | ------- | ------------------------ |
| **LCP** (Largest Contentful Paint)  | < 2.5s  | 主要コンテンツの表示速度 |
| **INP** (Interaction to Next Paint) | < 200ms | インタラクションの応答性 |
| **CLS** (Cumulative Layout Shift)   | < 0.1   | レイアウトのずれ         |
| **TTFB** (Time to First Byte)       | < 800ms | サーバー応答時間         |
| **FCP** (First Contentful Paint)    | < 1.8s  | 初回描画速度             |

### 実装ルール

- **画像:** 必ず `next/image` を使う。`priority` はヒーロー画像のみ、他は lazy
- **フォント:** `next/font` で self-host、外部 CDN 直リンク禁止
- **サードパーティスクリプト:** `next/script` の `strategy="lazyOnload"` を優先
- **JSバンドル:** 主要ページの JS < 200KB（gzip）を目安
- **画像上限:** 単一投稿画像 10MB、アバター 2MB
- **クリティカルパス:** ホーム・投稿詳細・カフェ詳細は SSG or ISR で TTFB 短縮
- **N+1回避:** 一覧系は Postgres 関数 or JOIN で1クエリに

### 計測

- Vercel Analytics（無料枠）で本番の Real User Monitoring
- Lighthouse CI で PR ごとに自動計測（可能なら）
- 目標を割った場合は即改善タスク化

## セキュリティと安全

- **`.env*` を絶対にコミットしない**（`.gitignore` で除外を厳守）
- **Supabase Service Role Key はサーバー側のみ**（クライアント公開禁止）
- **画像アップロード時は EXIF を必ず剥がす**（位置情報保護）。クライアント側除去（`processPostImage`）に加え、
  署名付きURL直PUT方式で迂回された場合の保険として `createPost` / `createOfficialPost` がサーバー側でも
  GPS の有無を再検証する（[pending-items.md A10](docs/product/pending-items.md#a10-exif除去がクライアント信頼に依存している-解消済2026-09-25)）
- **未成年アカウントは追加のガード**（RLSで `profiles.status = 'active'` チェック）
- **通報・ブロックは即時RLSに反映**

## 進め方の原則

- **設計と実装がズレたら、まずドキュメントを更新してから実装を進める**
- **新しい依存を追加する場合は事前提案** — スタック変更はプロジェクトの根幹に影響
- **DB変更は必ずマイグレーションで**（直接いじらない）
- **未決事項は [product/pending-items.md](docs/product/pending-items.md) を更新**
- **メモリ（ユーザー知見・プロジェクト決定事項）は `~/.claude/projects/.../memory/` へ**
- **UI/UX・設計判断で行動経済学的な観点や設計思想の裏付けが要る場合、Obsidian vault（`mcp__obsidian__*` ツール）の `個人開発/cafe_sns_site/概要.md` の「参考読書」セクションを起点に、リンク先の `読書/` 配下の各ノートを `vault_read` で辿る。各ノートの「cafe_sns_siteへの応用アイデア」見出しに実装への示唆がまとまっている**
- **PRマージ後は `/dashboard-update` で Obsidian vault の `個人開発/cafe_sns_site/cafe_sns_site_dashboard.md`（最新状態のみ）と `個人開発/cafe_sns_site/実装履歴/`（セッションごとに追記）を更新する** — リポジトリ内の `docs/implementation-board.html` とは役割が別（設計の正 vs 判断ログ）で、どちらか一方では代替できない
