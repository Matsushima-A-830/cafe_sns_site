---

name: fe-implement
description: フロントエンド実装（ページ・コンポーネント・レイアウト）を進める。Next.js App Router + Tailwind + shadcn/ui + Tiptap。
---

# /fe-implement — フロントエンド実装

## 起動時に必ずやること

1. **画面ID の特定:** 実装対象の `S_*` を確認
2. **ドキュメント3点セット参照:**
   - [docs/design/wireframes/](../../../docs/design/wireframes/) で該当画面のレイアウト
   - [docs/architecture/routing.md](../../../docs/architecture/routing.md) で URL・所属グループ・SSR/ISR方針
   - [docs/design/screen-flow.md](../../../docs/design/screen-flow.md) で前後の遷移
3. **モバイル + PC の両方** を確認（別レイアウトが定義されていれば両方対応）
4. **既存コンポーネントの再利用可能性を Grep で調査**（重複実装しない）

## 実装順序（TDD準拠）

1. **型定義を先に**: Props と State の型を書く
2. **必要な Server Actions / データ取得層 のインターフェースを合意** (`/be-implement` の作業と分離)
3. **プレゼンテーションから実装** — 静的なマークアップとスタイルを組む
4. **状態管理を追加** — インタラクション
5. **Server Actions と接続**
6. **エラー/ローディング/空状態** — `error.tsx` `loading.tsx` `not-found.tsx`
7. **アクセシビリティ確認** — ラベル・role・キーボード操作
8. **テスト:** イベントハンドラの発火 + 主要な分岐

## Next.js App Router のパターン

### Server Component をデフォルトに

- データ取得は Server Component で（`fetch` or Supabase Server Client）
- `'use client'` は本当に必要な箇所（onClick, useState, useEffect 等）だけ
- 大きな Client Component は避け、islands 化する

### レイアウトの継承

```
app/
├── layout.tsx                       # 全体（Provider）
├── (browsing)/layout.tsx            # ヘッダー + フッター
│   └── page.tsx                     # S_HOME
├── (user)/layout.tsx                # サイドナビ + ボトムナビ
│   └── me/page.tsx                  # S_MYPAGE
```

- 実装時、どの layout を継承するかを常に意識
- `layout.tsx` は再レンダーされない前提でロジックを書く

### Server Actions の呼び出し

```tsx
// components/features/likes/LikeButton.tsx
'use client'
import { useTransition } from 'react'
import { toggleLike } from '@/app/_actions/likes'

export function LikeButton({ postId, initialLiked, initialCount }: Props) {
  const [isPending, startTransition] = useTransition()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)

  function handleClick() {
    // 楽観更新
    setLiked((v) => !v)
    setCount((n) => n + (liked ? -1 : 1))
    startTransition(async () => {
      const result = await toggleLike({ postId })
      if (!result.ok) {
        // 巻き戻し
        setLiked(initialLiked)
        setCount(initialCount)
      }
    })
  }
  ...
}
```

**ポイント:**
- 楽観更新 + 失敗時ロールバックで体感速度を上げる（ピークエンド則）
- `useTransition` で pending 表示
- Server Actions は `{ ok: true } | { ok: false, error: ... }` の Result 型で統一

## デザインシステム遵守（必須）

**参照:** [docs/design/design-system.md](../../../docs/design/design-system.md)

### 記述前の3つの必須確認

1. **色:** `bg-brown-*` / `text-brown-*` を使う。`text-black` `bg-black` `#000` は絶対使用禁止
2. **余白:** `p-1`(4px例外), `p-2`(8px), `p-3`(12px例外), `p-4`(16px), `p-6`(24px), `p-8`(32px), `p-10`(40px), `p-12`(48px), `p-14`(56px), `p-16`(64px), `p-20`(80px), `p-24`(96px) のみ
3. **サイズ:** `text-xs/sm/base/lg/xl/2xl/3xl/4xl` のみ。任意値 `text-[15px]` 禁止

### 良い例

```tsx
;<div className="p-4 md:p-6 lg:p-8 bg-brown-50 text-brown-900 border border-brown-200 rounded-lg">
  <h2 className="text-2xl font-bold text-brown-900 mb-4">見出し</h2>
  <p className="text-base text-brown-700">本文</p>
  <button className="mt-6 px-6 py-3 bg-brown-500 hover:bg-brown-600 text-brown-50 rounded-md">
    アクション
  </button>
</div>
```

### 悪い例（すべて修正必須）

```tsx
;<div className="p-5 bg-black text-black">
  {' '}
  ❌ p-5禁止 / black禁止
  <h2 className="text-[15px] mt-7">見出し</h2> ❌ 任意値サイズ / mt-7禁止
  <p style={{ color: '#000', padding: 10 }}>本文</p> ❌ インラインstyle / #000
</div>
```

## Tailwind + shadcn/ui の使い方

### shadcn/ui コンポーネント導入

```bash
pnpm dlx shadcn@latest add button dialog form input textarea
```

- `components/ui/` に生成される（変更可能なコード）
- **色トークンを必ずbrown系に置換** — 生成直後の CSS 変数は `slate` 等になっているため、`app/globals.css` の `:root` セクションで `--background: var(--color-brown-50)` 等に上書き
- 詳細は [design/design-system.md #shadcnuiの色調整](../../../docs/design/design-system.md#shadcnuiの色調整) 参照

### レスポンシブの分岐点

CLAUDE.md の方針に従う:

| BP    | 幅      | 用途       |
| ----- | ------- | ---------- |
| 無印  | ~ 767px | モバイル   |
| `md:` | 768〜   | タブレット |
| `lg:` | 1024〜  | PC基本     |
| `xl:` | 1280〜  | PC贅沢     |

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
```

### ダークモード

- `dark:` プレフィックスで対応
- 実装初期段階では無理に対応しない（後追いでOK）
- ダーク時も `#000` 禁止 — `brown-900` を背景に使う

## フォーム実装のパターン

**基本形（Zod + Server Actions）:**

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileSchema } from '@/lib/validators/profile'
import { updateProfile } from '@/app/_actions/profiles'

export function ProfileEditForm({ initial }: Props) {
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: initial,
  })

  async function onSubmit(values: z.infer<typeof profileSchema>) {
    const result = await updateProfile(values)
    if (!result.ok) form.setError('root', { message: result.error })
    else router.push('/me')
  }

  return <Form {...form}>...</Form>
}
```

- **Zodスキーマは `lib/validators/` で一元管理**
- Server Actions 側も同じスキーマを使う

## Tiptap（ブログエディタ）

```tsx
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      // 意図的に無効化する機能
      codeBlock: false,
    }),
    Link,
    Image,
  ],
  content: initial ?? null,
  onUpdate: ({ editor }) => {
    debouncedSave(editor.getJSON()) // drafts テーブルへ
  },
})
```

**制約（CLAUDE.md の決定事項）:**
- 有効化: 見出し(h2/h3), 太字, 斜体, リンク, 画像, 引用, リスト
- 無効化: テーブル, カラム分割, カスタム色, フォント指定
- 保存形式: JSON（HTMLではない）

## 画像アップロード（EXIF 除去必須）

```tsx
async function handleFile(file: File) {
  // 1. EXIF を剥がす（ライブラリ: sharp on server or exifr on client）
  const cleaned = await stripExif(file)
  // 2. 署名付きURL を取得
  const { url, key } = await fetch('/api/uploads/sign').then((r) => r.json())
  // 3. 直接S3にPUT
  await fetch(url, { method: 'PUT', body: cleaned })
  // 4. 結果を状態に反映
  setImageKey(key)
}
```

**重要:** EXIF 除去失敗時はアップロード中止（プライバシー最優先）。

## エラー・空状態の設計

必ず用意する:
- **`loading.tsx`** — スケルトンUI（レイアウトシフト回避）
- **`error.tsx`** — フレンドリなメッセージ + [再読み込み] [ホームへ]
- **`not-found.tsx`** — 「投稿が見つかりません」等の意味のあるコピー
- **空状態** — 「まだ投稿がありません [投稿を作成]」等のCTA付き

## 行動経済学の適用チェック（CLAUDE.md 参照）

該当する要素があれば適用:
- **デフォルト効果:** フォーム初期値、タブの初期選択
- **選択のパラドックス回避:** 選択肢は5〜7個まで、「もっと見る」で拡張
- **ピークエンド則:** 完了アニメーション、成功トースト
- **損失回避:** 破棄操作は確認ダイアログ、下書き自動保存
- **返報性:** 通知からのワンタップフォローバック等

## 実装後のセルフレビュー観点

- [ ] 画面ID コメントを `page.tsx` 冒頭に書いたか
- [ ] モバイル・タブレット・PC の3レイアウトで崩れないか
- [ ] `'use client'` が本当に必要か（Server Component 化できないか）
- [ ] Zodスキーマを使ってバリデーションしているか
- [ ] エラー/ローディング/空状態を用意したか
- [ ] キーボード操作・スクリーンリーダーで使えるか
- [ ] 楽観更新している箇所は失敗時ロールバックを実装したか
- **デザインシステム:**
  - [ ] `text-black` `bg-black` `#000` `#000000` が Grep しても出てこないか
  - [ ] 余白ユーティリティが `0/1/2/3/4/6/8/10/12/14/16/20/24` のみか（5,7,9,11 等禁止）
  - [ ] 任意値 `[XXpx]` を使っていないか（使う場合は8倍数のみ）
  - [ ] インライン `style=` を使っていないか
  - [ ] `text-brown-*` `bg-brown-*` を使ってブラウン系に統一されているか
- [ ] `/self-review` を実行
- [ ] `/board-update` で実装状況ボードを更新

## やらないこと

- CSS-in-JS の追加導入（Tailwind一本）
- 状態管理ライブラリの新規導入（React組み込み + Tanstack Query で足りる）
- カスタムアニメーションライブラリ（Framer Motion は必要になってから）
- Storybook（MVPでは過剰）
