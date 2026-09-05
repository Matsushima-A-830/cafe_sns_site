# Git ワークフロー

このプロジェクトのGit運用規約。**個人開発でも規律を保つため厳守する**（Claude Code に指示するときも同じ規約を守ってもらう）。

## リポジトリ

- **ホスティング:** GitHub（プライベート）
- **リポジトリ名:** `cafe_sns_site`
- **デフォルトブランチ:** `main`

## ブランチモデル: GitHub Flow

シンプルなトランクベース + short-lived feature branch。

```
main (常にデプロイ可能。保護設定は下記「ブランチ保護」参照)
 ├── feature/xxx
 ├── fix/xxx
 ├── refactor/xxx
 └── docs/xxx
```

- **`main`** — 常に production にデプロイ可能な状態を保つ
- **feature/fix/refactor/docs/chore ブランチ** — main から切って PR で main にマージ
- **long-lived develop ブランチは持たない** — 個人MVPでは複雑すぎる

## ブランチ命名規則

```
{type}/{短い説明}[-{issue番号}]

例:
  feature/mood-entry-home
  feature/owner-official-post-88
  fix/signup-otp-timing
  refactor/server-actions-split
  docs/positioning-update
  chore/deps-update
```

**type 一覧:**
- `feature/` — 新機能
- `fix/` — バグ修正
- `refactor/` — リファクタ（挙動変更なし）
- `docs/` — ドキュメントのみ
- `chore/` — 雑務（依存更新・設定変更等）
- `test/` — テスト追加のみ
- `perf/` — パフォーマンス改善

## コミットメッセージ: Conventional Commits (日本語)

**フォーマット:**

```
{type}: {概要}

{任意: 詳細な説明}

{任意: BREAKING CHANGE / Refs}
```

**type 一覧（コミット用、ブランチ命名と同じ）:**

| type | 用途 |
|---|---|
| `feat` | 新機能追加 |
| `fix` | バグ修正 |
| `refactor` | リファクタ（挙動変更なし） |
| `docs` | ドキュメントのみ |
| `chore` | 依存更新・設定・雑務 |
| `test` | テスト追加のみ |
| `perf` | パフォーマンス改善 |
| `style` | フォーマット（Biome/Prettier適用） |
| `build` | ビルドシステム変更 |
| `ci` | CI設定変更 |

**言語:** 日本語基本。ただし依存更新や自動生成は英語でも可。

### 良い例

```
feat: 気分入り口をS_HOMEに追加

positioning.md の幹Aに基づき、ホーム最上部に
「今、どんなカフェ気分？」セクションを追加。
occasion タグを priority 順で表示。

Refs: #88
```

```
fix: 保護者同意メールのトークン検証エラーを修正

期限切れトークンで500になっていたのを400+エラー
コードに変更。error-catalog.md の CONSENT_TOKEN_INVALID
を使用。
```

```
refactor: Server ActionsをFeature単位に分割

app/_actions/index.ts が肥大化したため、
posts/comments/likes 等に分割。挙動変更なし。
```

### 悪い例

```
❌ 修正                              (typeなし・情報不足)
❌ WIP                               (中途半端なコミット)
❌ fix bug                           (何のバグか不明)
❌ feat: いろいろ変更                (曖昧すぎる)
❌ FEAT: home update                 (大文字混在)
```

## コミットの粒度

- **1コミット = 1論理単位** — レビューで独立して理解できる粒度
- **通るテストとセットでコミット** — テストなしの実装コミットは避ける（TDD）
- **フォーマット変更と機能変更を分離** — `style` と `feat` を混ぜない
- **WIP コミットは push 前に squash / rebase で整理**

## PR タイトル・本文

### タイトル

コミットメッセージと同じフォーマットで書く:

```
feat: 気分入り口をS_HOMEに追加
```

### 本文テンプレート

`.github/pull_request_template.md` に配置:

```markdown
## 概要

<この PR で何を達成するか、1〜2文>

## 変更内容

- <箇条書き>
- <箇条書き>

## 関連ドキュメント

- Refs: #xxx
- 関連: docs/product/positioning.md, docs/architecture/data-model/tables.md 等

## テスト方法

- [ ] 自動テストが通ること
- [ ] 該当する画面で操作確認

## スクリーンショット / 動画（UI変更時）

<Before / After>

## セルフレビュー完了

- [ ] `/code-review` 実施
- [ ] デザインシステム遵守（余白8倍数・brown系・#000なし）
- [ ] ユビキタス言語遵守（glossary.md）
- [ ] エラーコードは error-catalog.md 準拠
- [ ] TypeScript strict / Zod スキーマ検証あり
- [ ] マイグレーション含む場合 `pnpm db:reset` が通る
```

## PR 運用（個人開発でも実施）

- **必ずブランチを切って PR 作成** — 直接 main に push しない
- **PR を作ったら CI 待ち → セルフレビュー → マージ**
- **1 PR = 1 関心事** — 大きな変更は複数 PR に分ける
- **Draft PR で早めに WIP 共有**（レビュー相手ができたとき用）

## マージ方法: Squash Merge のみ

- main のヒストリーをリニアに保つ
- コミット単位の細かい記録は不要（PRタイトルが履歴として残る）
- GitHub の設定で Squash merge のみ許可、Merge commit / Rebase merge は禁止

## ブランチ保護（main）

> ⚠️ **現状は未設定**。GitHub Free では private リポジトリの branch protection / rulesets が使えない（API は HTTP 403）。
> 下記は Pro 加入 or Public 化した時点で有効化する目標値であり、**それまでは lefthook（pre-push）+ CI の二重チェックで代替**する。
> 詳細と選択肢: [pending-items D7](../product/pending-items.md)

有効化できるようになったら以下を設定:

- ✅ 直接 push 禁止
- ✅ PR 必須（自分含む）
- ✅ Status checks 必須（CI パス）
  - `Lint / Typecheck / Test`（`ci.yml`）
  - `Build`（`ci.yml`、`next build`）
  - `e2e`（Playwright、時間がかかる場合はメインパスのみ）
  - `migration-check`（Supabase migration lint）
- ✅ ブランチが最新であることを要求
- ✅ Delete branch on merge
- ❌ Approval 必須にはしない（個人開発）

**保護が無効な間の運用ルール（自己規律で担保）:**

- `main` への直接 push はしない。必ずブランチ → PR → Squash Merge
- CI が赤い PR はマージしない
- `--no-verify` で pre-push を飛ばさない

## タグ・リリース

- **Semantic Versioning:** `v{major}.{minor}.{patch}`
- **タグは main にのみ付ける**
- **MVP リリースは `v1.0.0`**
- **CHANGELOG.md** は semantic-release で自動生成（後日導入検討）

### バージョン基準

- `major` — 破壊的変更 or MVP → GA 等の大きな節目
- `minor` — 新機能追加
- `patch` — バグ修正・小さな改善

## .gitignore

Next.js + Supabase + Playwright の想定:

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Next.js
.next/
out/
build/
next-env.d.ts

# Env
.env
.env.local
.env.*.local
!.env.example

# Supabase local
supabase/.branches/
supabase/.temp/

# Testing
coverage/
playwright-report/
test-results/
.playwright/

# TypeScript
*.tsbuildinfo

# Editor
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea/
.cursor/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
pnpm-debug.log*

# Vercel
.vercel/

# Sentry
.sentryclirc

# Local dev artifacts
tmp/
scratch/
```

## .gitattributes

**Windows開発なので改行コードを明示指定:**

```gitattributes
* text=auto eol=lf
*.md text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.js text eol=lf
*.json text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
*.sql text eol=lf

# バイナリ扱い
*.png binary
*.jpg binary
*.jpeg binary
*.webp binary
*.svg text eol=lf
*.ico binary
*.woff binary
*.woff2 binary
```

## Git hooks: lefthook

**Windowsフレンドリな hook マネージャ**として lefthook を採用（Husky よりシェル依存が少ない）。

`lefthook.yml`:

```yaml
pre-commit:
  parallel: true
  commands:
    biome-check:
      glob: "*.{ts,tsx,js,jsx,json,css}"
      run: |
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
        pnpm biome check --write {staged_files}
      stage_fixed: true

commit-msg:
  commands:
    conventional-commits:
      run: |
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
        pnpm commitlint --edit {1}

pre-push:
  parallel: true
  commands:
    typecheck:
      run: |
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
        pnpm typecheck
    test:
      run: |
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
        pnpm test:run
```

- **nvm を source する理由:** GUIクライアントや Windows 側から起動された hook は nvm の PATH を引き継がず、`pnpm` が見つからずに失敗するため
- 型チェックは全体スキャンで遅いので pre-commit には置かず pre-push に寄せている

`commitlint.config.ts`:

```typescript
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'refactor', 'docs', 'chore',
      'test', 'perf', 'style', 'build', 'ci'
    ]],
    'subject-case': [0],  // 日本語対応のため無効化
  },
}
```

## Issue 管理

- **GitHub Issues** を使う
- ラベル: `type: feature` / `type: bug` / `type: docs` / `priority: high|medium|low`
- テンプレート: `.github/ISSUE_TEMPLATE/`（後日整備）
- MVP開始時点では pending-items.md がタスク管理を兼ねる（issue化はMVPリリース後）

## セキュリティ運用

- **`.env*` を絶対にコミットしない** — .gitignore で除外を厳守
- **Secret scanning を有効化**（GitHub 標準機能）
- **Dependabot** で依存の脆弱性を自動検知
- **Push protection** で秘密情報のコミットをブロック

## Claude Code との協業ルール

- ブランチ切り替え、PR作成、コミットは **必ずユーザー確認を経る**
- 破壊的操作（force push, hard reset, branch削除等）は明示指示なしにやらない
- pre-commit hook 失敗時は `--no-verify` で回避しない、根本原因を直す
- コミットメッセージには「Co-Authored-By: Claude ...」を付ける（CLI設定に従う）

## トラブルシューティング

### push が rejected

- main が更新されている → `git fetch && git rebase origin/main`

### hook が失敗

- `/debug` スキル参照
- 一時的に `--no-verify` は使わない（原因を潰す）

### 誤ってコミットしてしまった

- **push 前:** `git reset --soft HEAD~1` で戻せる
- **push 後:** 新しい fix コミットで対処、force push は禁止（main）

### 大きなファイルをコミットしてしまった

- 履歴から除去する必要あり → `git filter-repo` または BFG Repo-Cleaner
- 慎重に、必ずバックアップを取る
