---
name: test
description: TDDワークフローとテスト設計を指南する。新機能実装前、リファクタ前、複雑なロジック実装時に使う。
---

# /test — TDDガイド

## 起動時に必ずやること

1. **対象タスクの分類:**
   - コアロジック（Server Actions・バリデーション・DB関連・ドメイン計算） → **TDD必須**
   - UIコンポーネント（ピクセルいじり・スタイル） → **テスト後付け可**
   - E2Eフロー（複数画面をまたぐ） → **Playwright先行 or 実装後**
2. **既存テストの確認:** 変更対象の既存テストを `Grep` で探す。命名は `*.test.ts` `*.spec.ts`
3. **ドキュメント参照:** [docs/architecture/data-model/tables.md](../../../docs/architecture/data-model/tables.md) の RLS ポリシーとバリデーションルールを確認

## Red-Green-Refactor サイクル

### Red: 失敗するテストを書く

**書くべきこと:**
- 期待する入出力の1ケース（Happy Path）
- 主要なバリデーションエラー
- 認可エラー（該当時）

**書かないこと:**
- まだ決まっていない仕様のテスト
- 何十パターンもの網羅（Green前に増やさない）

**確認:** `pnpm test:run <path>` で失敗することを目視する（合格してしまうテストは意味がない）。

### Green: 最短で通す

**原則:**
- テストを通す最小限のコードだけ書く
- 「あとで使うかも」のフックポイントは作らない
- 型を厳密にすることに時間を使いすぎない（Refactor でやる）

### Refactor: 設計を整える

**タイミング:** テストがGreenを維持しているとき **のみ**。

**やること:**
- 名前を意図が伝わるものに
- 責務を分離
- 重複を除去（ただし3回目までは我慢）
- パフォーマンスの明らかな問題を解消

## テストフレームワークの使い分け

| 種類 | ツール | 対象 | 配置 |
|---|---|---|---|
| ユニット | Vitest | 純粋関数・ユーティリティ・Zodスキーマ | 実装ファイル隣 `xxx.test.ts` |
| コンポーネント | Vitest + RTL | クライアントコンポーネント単体 | 実装ファイル隣 |
| Server Actions | Vitest | ロジック（Supabase Clientはモック or 実DB） | `xxx.test.ts` |
| 統合 | Vitest + 実Supabase | RLS込みのDB操作検証 | `tests/integration/` |
| E2E | Playwright | ユーザー導線 | `tests/e2e/` |

## Vitest の書き方（Server Actions 例）

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createPost } from './posts'

describe('createPost', () => {
  it('公開投稿を作成し、下書きを削除する', async () => {
    // Arrange: モッククライアントを注入
    const mockClient = createMockSupabase({
      posts: { insert: vi.fn().mockResolvedValue({ id: 'p1' }) },
      drafts: { delete: vi.fn().mockResolvedValue({}) },
    })

    // Act
    const result = await createPost({
      draftId: 'd1',
      title: 'Test',
      body: '...',
    }, { client: mockClient })

    // Assert
    expect(result).toEqual({ postId: 'p1' })
    expect(mockClient.from('drafts').delete).toHaveBeenCalledWith('d1')
  })

  it('bodyが空ならZodバリデーションエラーを返す', async () => {
    await expect(createPost({ body: '' }, {})).rejects.toThrow(/body/)
  })
})
```

**ポイント:**
- クライアントは引数で注入し、モックしやすくする
- モックは最小限（呼ばれるメソッドだけ）
- Zodエラーは `rejects.toThrow` で検証

## RLS を含む統合テストの書き方

```typescript
import { setupTestDb, createTestUser } from 'tests/helpers'

describe('posts RLS', () => {
  it('ブロック相手の投稿は SELECT で見えない', async () => {
    const db = await setupTestDb()
    const [alice, bob] = await Promise.all([
      createTestUser(db, { id: 'alice' }),
      createTestUser(db, { id: 'bob' }),
    ])
    await db.blocks.insert({ blocker_id: 'alice', blocked_id: 'bob' })
    await db.posts.insert({ author_id: 'bob', body: '...' })

    const asAlice = db.impersonate('alice')
    const { data } = await asAlice.from('posts').select().eq('author_id', 'bob')

    expect(data).toHaveLength(0)
  })
})
```

**注意:** 統合テストは並列実行時のDB分離が必要。トランザクションでラップして最後にロールバック、またはスキーマ単位で分離。

## E2E（Playwright）の書き方

**書くべきシナリオ:**
- クリティカルパス（新規登録 → 投稿 → 削除 等）
- 認可の境界（未ログイン → 保護ページ → ログイン後元のページへ）
- 損失回避 UX（下書き自動保存 → リロード → 復元）

**書かないシナリオ:**
- ユニット/統合で検証できることの重複
- CSS ピクセル比較（Percy等のビジュアルテストは別レイヤー）

## モックの原則

- **モックは境界のみ:** Supabase Client, S3 SDK, 外部API
- **モックしないもの:** Zodスキーマ、ユーティリティ関数、内部ロジック
- **`vi.mock` は最終手段:** 引数DI が可能なら常に DI を優先

## テストデータの管理

- **ファクトリ関数** を `tests/factories/` に配置（Fishery 等使用可）
- **seed データ** はテストで汚染しないよう分離
- **`describe.each`** で境界値ケースを網羅

## カバレッジ目標（MVP）

厳格な数字目標は設けないが、指針:

| レイヤー | 目安 |
|---|---|
| Zodスキーマ | 100%（境界ケース含む） |
| Server Actions | Happy Path + 主要エラー |
| ドメインロジック | 90%以上 |
| コンポーネント | イベントハンドラの発火確認程度 |
| E2E | クリティカルパス5〜10本 |

## よくある落とし穴

- **RLSポリシーの検証を忘れる** → 実DBの統合テストで必ず確認
- **Server Actions の `redirect()` はスローされる** → try/catch で握らない
- **Supabase の `auth.uid()` はモック不可** → 統合テストで実セッション使用
- **Tiptap JSON の等価チェック** → 深い比較 or スナップショット使用
- **時間依存テスト** → `vi.useFakeTimers()` で固定

## 終了時のチェック

- [ ] `pnpm test:run` がすべて Green
- [ ] `pnpm typecheck` が Green
- [ ] `pnpm lint` が Green
- [ ] 追加した/変更したロジックに対応するテストが存在する
- [ ] TDD の順序（Red → Green → Refactor）を守ったか自己確認
