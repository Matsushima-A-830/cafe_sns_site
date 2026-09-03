# カフェSNS

気分で見つかる、行きつけと繋がる — カフェ好きのためのSNS

## クイックスタート

```bash
pnpm install
cp .env.example .env.local  # 値を埋める
pnpm db:start               # Supabase local (要 Docker)
pnpm dev                    # http://localhost:3000
```

## ドキュメント

すべての設計は [`docs/`](./docs/README.md) にあります。実装前に必ず参照:

- [ポジショニング](./docs/product/positioning.md) — 差別化戦略の幹
- [MVPスコープ](./docs/product/mvp-scope.md)
- [デザインシステム](./docs/design/design-system.md)
- [Gitワークフロー](./docs/operations/git-workflow.md)
- [ユビキタス言語](./docs/glossary.md)

Claude Code 用の常時参照コンテキスト: [`CLAUDE.md`](./CLAUDE.md)

## 主要コマンド

```bash
pnpm dev              # 開発サーバー
pnpm build            # プロダクションビルド
pnpm lint             # Biome
pnpm typecheck        # tsc --noEmit
pnpm test             # Vitest
pnpm test:e2e         # Playwright
pnpm db:reset         # DB初期化 + seed
```
