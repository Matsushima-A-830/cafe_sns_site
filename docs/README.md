# カフェSNS 設計ドキュメント

このディレクトリは実装の**唯一の情報源**。コードとドキュメントで齟齬が出た場合はドキュメント優先で議論する。

プロジェクト基本情報・技術スタックは [../CLAUDE.md](../CLAUDE.md) 参照。

## ディレクトリ構造

```
docs/
├── README.md                       ← このファイル
├── glossary.md                     ユビキタス言語（全ドキュメント横断）
├── implementation-board.html       実装状況ボード（ブラウザで開く / 現在地の要約）
├── product/                        戦略・スコープ・TODO
├── architecture/                   データモデル・ルーティング・エラー
├── design/                         デザインシステム・画面遷移・ワイヤーフレーム
├── operations/                     開発サイクル・Git・デプロイ
└── seed/                           バッジ・タグ・エリア・NGワードの初期投入データ
```

## カテゴリ別インデックス

### 🎯 Product（戦略・スコープ）

| ドキュメント | 内容 |
|---|---|
| **[positioning.md](./product/positioning.md)** ⭐️ | 差別化戦略の幹（気分検索 + オーナー連携）。すべての判断の起点 |
| [mvp-scope.md](./product/mvp-scope.md) | MVP対象機能と後回し機能 |
| [pending-items.md](./product/pending-items.md) | 優先度別の未決事項リスト |

### 🏛 Architecture（データモデル・ルーティング）

| ドキュメント | 内容 |
|---|---|
| [data-model/README.md](./architecture/data-model/README.md) | ER図・設計方針・RLS方針 |
| [data-model/tables.md](./architecture/data-model/tables.md) | 27テーブルの列・制約・RLSポリシー / ストレージ設計 |
| [routing.md](./architecture/routing.md) | Next.js App Router・URL・middleware方針 |
| [error-catalog.md](./architecture/error-catalog.md) | Result型エラーコード一覧 |

### 🎨 Design（デザイン・画面）

| ドキュメント | 内容 |
|---|---|
| **[design-system.md](./design/design-system.md)** ⭐️ | 余白/カラー/サイズ規約、brownパレット、セマンティックトークン |
| [screen-flow.md](./design/screen-flow.md) | Mermaid フロー6種 |
| [wireframes/README.md](./design/wireframes/README.md) | 37画面のモバイル/PCレイアウト（ASCII） |

### ⚙️ Operations（開発サイクル・Git・デプロイ）

| ドキュメント | 内容 |
|---|---|
| **[development-cycle.md](./operations/development-cycle.md)** ⭐️ | スキルを使った1周（着手判断→実装→レビュー→実機確認→出荷→引き継ぎ）の順序と理由 |
| **[git-workflow.md](./operations/git-workflow.md)** ⭐️ | ブランチ・コミット・PR規約 |
| **[deployment.md](./operations/deployment.md)** ⭐️ | 環境構成・CI/CD・監視・ドメイン・AWS移行 |
| ⏳ [ci-outage-stacked-prs.md](./operations/ci-outage-stacked-prs.md) | **時限措置（〜2026-10-01）**: GitHub Actions予算切れ期間のスタックPR運用 |
| [agent-pipeline.md](./operations/agent-pipeline.md) | 無人実行（nightly）・自動レビュー・無人マージのステージと安全弁 |

### 🌱 Seed（初期投入データ）

| ドキュメント | 内容 |
|---|---|
| [badges-initial-set.md](./seed/badges-initial-set.md) | MVP投入バッジ20個 |
| [curated-tags-initial-set.md](./seed/curated-tags-initial-set.md) | 厳選タグ30個（シーン15+雰囲気10+その他5） |
| [areas-initial-set.md](./seed/areas-initial-set.md) | 東京45エリア（23区+副地域22） |
| [ng-words-initial-set.md](./seed/ng-words-initial-set.md) | NGワード初期セット（代表20語、運営が随時追加） |

### 📖 横断参照

| ドキュメント | 内容 |
|---|---|
| **[glossary.md](./glossary.md)** ⭐️ | ドメイン用語集（ユビキタス言語）— 日本語UI↔英語コード対応 |
| [implementation-board.html](./implementation-board.html) | 実装状況ボード。実装済み / 未着手 / 既知の穴 / 3ホライズンを1枚で俯瞰（更新は `/board-update`、指標は `scripts/board-stats.sh`）|

## 実装前チェックリスト

新機能や画面を実装する前に、必ず以下を確認:

1. [positioning.md](./product/positioning.md) — 幹A/Cを強化するか？
2. [glossary.md](./glossary.md) — 命名は既存語と整合するか？
3. 該当する [wireframes/](./design/wireframes/) — レイアウト方針
4. [design-system.md](./design/design-system.md) — 余白・カラー・サイズ規約
5. [data-model/tables.md](./architecture/data-model/tables.md) — DB影響・RLS設計
6. [routing.md](./architecture/routing.md) — URL・middleware
7. [error-catalog.md](./architecture/error-catalog.md) — 新規エラーコード追加が必要か
8. [git-workflow.md](./operations/git-workflow.md) — ブランチ切り方・コミットメッセージ

進め方そのもの（どのスキルをどの順で走らせるか）は [development-cycle.md](./operations/development-cycle.md) 参照。

## メンテナンス方針

- **新しい概念** — [glossary.md](./glossary.md) にまずエントリ追加してから実装
- **新しい未決事項** — [product/pending-items.md](./product/pending-items.md) に追加
- **仕様変更** — 該当ドキュメントを更新してから実装（ドキュメント優先）
- **ファイル追加時** — このREADMEのカテゴリ別インデックスにリンク追加
