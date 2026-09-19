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

Server Actions は主体をセッションから引くため内部で `createClient()` を呼ぶ。**引数DIではなくモジュールモック**で差し替える。

```typescript
// app/_actions/posts.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reservePost } from './posts'

// vi.mock のファクトリは import より前に巻き上げられるので vi.hoisted が要る
const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

/** テストごとに、そのケースで呼ばれるメソッドだけ生やす */
function buildSupabaseStub(options: { user?: { id: string } | null; postInsert?: { error?: unknown } }) {
  const postsInsert = vi.fn().mockResolvedValue(options.postInsert ?? { error: null })
  return {
    stub: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: options.user ?? { id: userId } } }) },
      from: vi.fn((table: string) => ({ posts: { insert: postsInsert } })[table]),
    },
    spies: { postsInsert },
  }
}

afterEach(() => vi.clearAllMocks())

describe('reservePost', () => {
  // Server Actions は事実上公開エンドポイント。未検証の入力でDBに触らないことも認可の一部
  it('不正な入力は INVALID_INPUT を返し、createClient を呼ばない', async () => {
    const result = await reservePost({ postType: 'video' })

    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT', details: expect.anything() })
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
```

**ポイント:**
- スタブは**そのテストで呼ばれるメソッドだけ**生やす（`from()` が返すオブジェクトを table 名で引く形が扱いやすい）
- `crypto.randomUUID()` を使う実装は `vi.spyOn(crypto, 'randomUUID').mockReturnValue(...)` で固定する
- Zod エラーは throw ではなく `Result` で返るので `toEqual` で検証する（`rejects.toThrow` ではない）

## 読み取り関数は実DBで検証する

一覧・詳細の取得（`lib/posts/post-list.ts` `lib/profiles/public-profile.ts` 等）は supabase を**引数で受ける**設計なので、モックせず統合テストで実 DB に当てる。RLS が絡む以上モックでは意味のある検証にならない。

## RLS を含む統合テストの書き方

ヘルパーは `tests/helpers/supabase.ts`。**`pnpm db:start` でローカル Supabase が動いている必要がある**（`pnpm test:integration` で実行。通常の `pnpm test:run` には含まれない）。

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type AuthedUser, anonClient, createAuthedProfile, serviceRoleClient } from '../helpers/supabase'

const service = serviceRoleClient()   // RLS をバイパス。前提データの用意と後片付け専用
let alice: AuthedUser
let bob: AuthedUser

beforeAll(async () => {
  // profiles 付きの使い捨てユーザー。status や username を上書きできる
  alice = await createAuthedProfile({ username: 'alice_example' })
  bob = await createAuthedProfile({ username: 'bob_example', status: 'suspended' })
})

// テストが作った行は自分で消す。cleanup() は auth.users を消し、profiles は cascade で落ちる
afterAll(async () => {
  await alice?.cleanup()
  await bob?.cleanup()
})

it('ブロック相手の投稿は SELECT で見えない', async () => {
  await service.from('blocks').insert({ blocker_id: alice.userId, blocked_id: bob.userId })

  const { data } = await alice.client.from('posts').select('id').eq('author_id', bob.userId)

  expect(data).toEqual([])
})
```

**使い分け:**

| クライアント | Postgres ロール | 用途 |
|---|---|---|
| `anonClient()` | `anon` | 未ログインの見え方 |
| `AuthedUser.client` | `authenticated` | 本人視点。RLS の検証はこれで行う |
| `serviceRoleClient()` | `service_role` | 前提データの用意・後片付けのみ。**検証には使わない** |

**注意:**
- `tests/helpers/supabase.ts` の `assertLocal()` が接続先をローカルに限定している。`SUPABASE_URL` を export したまま走らせても本番の行は消えない
- トランザクションでのロールバックはしていない。**作った行を `afterAll` で消す**（他テストのデータを巻き込まないよう、自分が作った id だけに絞って検証する）
- **RLS 違反は 42501 のエラーとは限らず、「0件」で返る経路がある。** `expect(error?.code).toBe('42501')` と `expect(data).toEqual([])` のどちらを期待すべきか、実際に走らせて確かめる
- `auth.uid()` はモックできない。認可の検証は必ずこの実セッション経由

## E2E（Playwright）の書き方

### 実機確認を1〜2本だけ spec に落とす

**Playwright MCP で実機確認したら、そのシナリオのうち「壊れたら気づきたいもの」を spec にする。**
手で確認した結果はセッションが終われば消える。残さない限り、次に壊れたとき CI は気づかない。

全部は書かない。**1機能あたり1〜2本**、次の観点で選ぶ。

- **サーバーを跨がないと壊れ方が見えないもの** — 楽観更新 + `router.refresh()` は画面上だけ
  成功して DB に入っていない・リロードで消える、という壊れ方をする。ユニットとコンポーネントの
  テストはサーバーをモックするためこの層を通らない
- **画面を跨ぐ不変条件** — 「カフェ詳細で付けた印がマイページの件数に出る」など
- **認可の境界** — 未ログイン → 保護ページ → ログイン後に元のページへ

**書かないシナリオ:**
- ユニット/統合で検証できることの重複
- CSS ピクセル比較（ビジュアルテストは別レイヤー）
- ラベル文言だけの確認（コンポーネントテストで足りる）

### 前提データは自分で作り、自分で片付ける

`seed.sql` が作るのは admin プロフィール1件だけで、カフェも投稿も0件。ヘルパーは
`tests/e2e/helpers/`（`createOnboardedUser` / `createActiveCafe` / `cleanup` / `login`）。

```typescript
import { cleanup, createActiveCafe, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
})

const { user, cafe } = await setup(test.info().project.name)
await login(page, user, `/cafes/${cafe.id}`)   // ?next= 付きでログインし、目的の画面へ直行する
```

**サインアップ導線を毎回通さない。** `signup-onboarding.spec.ts` は OTP メールまで含めた縦切りで
1本あたり数十秒かかる。それ以外のテストは service role で「オンボーディング済みユーザー」を
直接作り、UI ではログインだけ行う（`onboarded_at` が無いと middleware に `/onboarding` へ飛ばされる）。

**識別子は乱数で作る。** 4プロジェクト（chromium / webkit / mobile-*）とファイル内の並行テストが
同時に走るため、`Date.now()` だけでは同一ミリ秒で衝突する。`username` は3〜20文字の上限があり、
長い接尾辞を詰めると切り詰めで重なる。

### 状態が変わるまで待つ

トグル類は送信中に `disabled` にせず、`handleClick` の `isPending` ガードで連打を止めている
（無効化するとフォーカスが `body` に落ちるため）。**`router.refresh()` の完了まで押下は黙って
捨てられる**ので、次の操作の前に `aria-busy` が `false` に戻るのを待つ。

```typescript
await expect(button).toHaveAttribute('aria-busy', 'false')
```

待たずに連続で押すと「クリックしたのに状態が変わらない」で落ち、実装のバグに見えてしまう。

## モックの原則

- **モックは境界のみ:** Supabase Client, 外部API
- **モックしないもの:** Zodスキーマ、ユーティリティ関数、内部ロジック
- **引数で supabase を受けられる関数はモックしない。** 実 DB の統合テストに回す（RLS はモックでは検証できない）
- **`vi.mock` は Server Actions のように内部で `createClient()` を呼ぶものに限る**

## テストデータの管理

- **統合テストのユーザー**は `createAuthedProfile()` で使い捨てを作る。`username` は衝突するとテストごと落ちるので、ファイル名由来の接尾辞を付ける（`alice_follow` `author_post_list` 等）
- **他テストのデータを巻き込まない。** 一覧を検証するときは「このテストが作った id」に絞ってから件数を数える
- **`seed.sql` が作るのは admin プロフィール1件だけ。** カフェも投稿も0件なので、必要な前提は自分で用意する
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
- **時間依存テスト** → ユニットは `vi.useFakeTimers()` で固定。**Postgres 関数は基準時刻を引数で受けられるようにする**（`get_cafe_congestion_current(p_cafe_id, p_now)`）。±1時間の窓を実時刻で検証すると、データ作成から RPC 呼び出しの間に時が進んで境界のケースが稀に落ちる
- **`RETURNS TABLE` の Postgres 関数** → `supabase gen types` は列を non-nullable に生成するが実際は NULL になりうる。型を信用せず NULL のケースをテストする
- **書き込みが RLS に弾かれたか** → エラーコードだけでなく「0件で返る」ケースを疑う。`.select()` の返り行で確認する
- **統合テストはローカル Supabase 必須** → `pnpm db:start` を忘れると接続情報の取得で落ちる。CI では4プロジェクトとも走る

## 終了時のチェック

- [ ] `pnpm test:run` がすべて Green
- [ ] DB・RLS に触れたなら `pnpm test:integration` も Green（ローカル Supabase 起動が前提）
- [ ] 実機確認したシナリオのうち、壊れたら気づきたいものを E2E に落とした（`pnpm test:e2e`）
- [ ] `pnpm typecheck` が Green
- [ ] `pnpm lint` が Green
- [ ] 追加した/変更したロジックに対応するテストが存在する
- [ ] TDD の順序（Red → Green → Refactor）を守ったか自己確認
