# デザインシステム

すべてのUI実装が従うデザイントークン・ルール。Tailwind CSS で表現する。

## 基本原則

1. **余白は 8px の倍数**（4px / 12px のみ例外として許可）
2. **アイコン・テキストのサイズは整数**（`px` 単位で小数禁止）
3. **主要トーンはブラウン系**（カフェの世界観を表現）
4. **`#000000` は禁止**（テキストも含めて、暖色寄りの濃色を使う）
5. **CSSはすべて Tailwind で記述**（インラインstyle・CSS Modules・styled-componentsは不使用）

---

## 1. 余白 (Spacing)

### 許可される値

| px | Tailwind | 用途例 |
|---|---|---|
| 0 | `0` | リセット |
| 4 | `1` ⚠例外 | アイコンとテキストの隙間など、8pxでは広すぎる場合 |
| 8 | `2` | 標準の小余白 |
| 12 | `3` ⚠例外 | 8/16の中間が必要な場合のみ |
| 16 | `4` | 標準の中余白 |
| 24 | `6` | 標準の大余白 |
| 32 | `8` | セクション区切り |
| 40 | `10` | 大きめの区切り |
| 48 | `12` | 画面ブロック区切り |
| 56 | `14` | 大セクション |
| 64 | `16` | 特大セクション |
| 80 | `20` | ヒーロー等 |
| 96 | `24` | 特大ヒーロー |

### 禁止される Tailwind ユーティリティ

以下は **使用禁止**（8の倍数でも4/12でもない）:

```
p-5   (20px)  ❌
p-7   (28px)  ❌
p-9   (36px)  ❌
p-11  (44px)  ❌
p-13  (52px)  ❌
p-15  (60px)  ❌
p-17  (68px)  ❌
p-18  (72px)  ❌ ← 72pxは8倍数だが、Tailwind標準では p-18 は存在しないので実質不要
```

同様に `m-`, `gap-`, `space-x-`, `space-y-` などすべての余白系ユーティリティで統一する。

### 任意値の扱い

`p-[13px]` のような arbitrary value は **原則禁止**。どうしても必要な場合は 8px倍数 or 4/12px に限定:

```
p-[72px]  ✅  (8倍数)
p-[13px]  ❌  (許可されない)
p-[4px]   ✅  = p-1 で書ける、arbitrary不要
```

### 参考: 8px グリッドの理由

- 一般的なデバイスDPRとの相性が良い
- 認知的にリズムが取りやすい（縦横の呼吸が揃う）
- 実装ブレを防止（マージン戦争回避）

---

## 2. サイズ (Size)

### テキストサイズ

Tailwind 標準のサイズを使用（すべて整数 px）:

| Tailwind | px | line-height | 用途 |
|---|---|---|---|
| `text-xs` | 12 | 16 | キャプション、補助テキスト |
| `text-sm` | 14 | 20 | メタ情報、ラベル |
| `text-base` | 16 | 24 | 本文（デフォルト） |
| `text-lg` | 18 | 28 | やや大きい本文 |
| `text-xl` | 20 | 28 | 小見出し |
| `text-2xl` | 24 | 32 | 見出し h3 |
| `text-3xl` | 30 | 36 | 見出し h2 |
| `text-4xl` | 36 | 40 | 見出し h1（PC） |

**禁止:** `text-[13.5px]`, `text-[15px]` 等の任意サイズ（Tailwind標準以外）は使用しない。

### アイコンサイズ

Tailwind の height/width で指定、整数px:

| Tailwind | px | 用途 |
|---|---|---|
| `h-4 w-4` | 16 | インラインアイコン |
| `h-5 w-5` | 20 | ボタン内アイコン |
| `h-6 w-6` | 24 | ナビゲーション |
| `h-8 w-8` | 32 | 見出しアクセント |
| `h-10 w-10` | 40 | アバター小 |
| `h-12 w-12` | 48 | アバター中 |
| `h-16 w-16` | 64 | アバター大 |

### 画像サイズ

- Next/Image の `width` / `height` は必ず整数
- アバター系は正方形（1:1）
- 投稿サムネイルは 4:5（Instagram 準拠）or 1:1
- ヒーロー画像は 16:9 or 21:9

---

## 3. カラーパレット

### メインパレット: Brown（コーヒー・ミルク・木材）

Tailwind CSS のカスタムカラーとして `brown` を定義:

| トークン | HEX | 用途 |
|---|---|---|
| `brown-50` | `#FAF7F2` | 最淡背景（ページ背景） |
| `brown-100` | `#F5EEE4` | カード背景 |
| `brown-200` | `#E8D9C4` | ボーダー淡 |
| `brown-300` | `#D4B896` | アクセント淡 |
| `brown-400` | `#B8956A` | アクセント |
| `brown-500` | `#8B6D47` | プライマリ（ボタン等） |
| `brown-600` | `#6F5637` | プライマリ濃（hover） |
| `brown-700` | `#543F2A` | テキスト濃 |
| `brown-800` | `#3A2C1E` | テキスト特濃 |
| `brown-900` | `#2B1A0F` | **`#000000` の代替**（最も濃い黒に近い茶） |

### セマンティックトークン（推奨: この命名で使う）

**原則:** コンポーネント実装では**セマンティック名を優先**して使う。`brown-500` のような具体色を直接指定するのは、セマンティックで表現できない特殊ケースのみ。

これにより、将来ブランドカラー変更・ダークモード対応・A/Bテストが1箇所の変更で済む。

#### レイアウト系

| セマンティック | Tailwindユーティリティ | 意味 |
|---|---|---|
| `bg-background` | 内部で `brown-50` | ページ全体の背景 |
| `bg-surface` | 内部で `white` | カード・パネル背景（フラット） |
| `bg-surface-elevated` | 内部で `white` + shadow | 浮き上がるカード（モーダル等） |
| `bg-muted` | 内部で `brown-100` | 非活性・補助背景 |

#### テキスト系

| セマンティック | Tailwindユーティリティ | 意味 |
|---|---|---|
| `text-foreground` | 内部で `brown-900` | 主要テキスト（本文・見出し）⭐️ `#000` 代替 |
| `text-muted-foreground` | 内部で `brown-700` | 副情報・補助テキスト |
| `text-subtle` | 内部で `brown-500` | 更に薄い補助（キャプション等） |

#### インタラクティブ系

| セマンティック | Tailwindユーティリティ | 意味 |
|---|---|---|
| `bg-primary` | 内部で `brown-500` | 主要ボタン背景 |
| `bg-primary-hover` | 内部で `brown-600` | 主要ボタン hover |
| `text-primary-foreground` | 内部で `brown-50` | 主要ボタン上のテキスト |
| `bg-secondary` | 内部で `cream-100` | 副次ボタン背景 |
| `text-secondary-foreground` | 内部で `brown-800` | 副次ボタン上のテキスト |
| `text-link` | 内部で `brown-600` | リンク色 |
| `text-link-hover` | 内部で `brown-700` | リンク hover |

#### 構造系

| セマンティック | Tailwindユーティリティ | 意味 |
|---|---|---|
| `border-default` | 内部で `brown-200` | 標準ボーダー |
| `border-strong` | 内部で `brown-300` | 強調ボーダー |
| `bg-input` | 内部で `white` | 入力欄背景 |
| `border-input` | 内部で `brown-200` | 入力欄ボーダー |
| `ring-focus` | 内部で `brown-400` | フォーカスリング |

#### 状態系

| セマンティック | Tailwindユーティリティ | 意味 |
|---|---|---|
| `bg-success` / `text-success-foreground` | 内部で `#4A7C59` / `white` | 成功トースト |
| `bg-warning` / `text-warning-foreground` | 内部で `#C77F3E` / `white` | 警告トースト |
| `bg-danger` / `text-danger-foreground` | 内部で `#A94438` / `white` | 危険操作・エラー |
| `bg-info` / `text-info-foreground` | 内部で `#5B7C99` / `white` | 情報通知 |

### 使い分けの目安

**推奨:**
```tsx
<div className="bg-surface text-foreground border border-default rounded-lg p-4">
  <h2 className="text-foreground text-2xl font-bold">タイトル</h2>
  <p className="text-muted-foreground text-base">本文</p>
  <button className="bg-primary hover:bg-primary-hover text-primary-foreground px-6 py-3">
    保存
  </button>
</div>
```

**許容（セマンティックにない場合のみ）:**
```tsx
<div className="bg-brown-100">    {/* 意味論的な役割が定義できない一時的な用途 */}
```

**非推奨（意味不明確）:**
```tsx
<div className="bg-brown-500 text-brown-50">   {/* 何のボタン？→ bg-primary text-primary-foreground を使うべき */}
```

### 補色（ミルク・クリーム）

セカンダリとして使用:

| トークン | HEX | 用途 |
|---|---|---|
| `cream-50` | `#FFFCF7` | ホワイト系背景 |
| `cream-100` | `#FFF8ED` | 温かみのある背景 |
| `cream-200` | `#FDECD1` | 淡いアクセント |

### アクセント（控えめに）

| 用途 | トークン | HEX |
|---|---|---|
| 成功 | `success` | `#4A7C59`（深緑・オリーブ） |
| 警告 | `warning` | `#C77F3E`（ハニー・キャラメル） |
| 危険 | `danger` | `#A94438`（ワインレッド） |
| 情報 | `info` | `#5B7C99`（アシッドブルー） |

これらもすべて暖色寄り、彩度控えめ。純色（`#FF0000` 等）は使用しない。

### 禁止色

以下は **絶対に使わない**:

| 禁止色 | 代替 |
|---|---|
| `#000000` / `text-black` / `bg-black` | `text-brown-900` / `bg-brown-900` |
| Tailwind default `text-black` | 上記 |
| 純白の `#FFFFFF` は原則UI背景に使わない（`brown-50` or `cream-50` を優先） | `bg-brown-50` |

**チェック:** `#000` `#000000` `text-black` `bg-black` `black/[0-9]` は grep で検出可能。

---

## 4. Tailwind 設定

### Tailwind v4（Next.js 15 デフォルト）の場合

`app/globals.css` に **基礎スケール + セマンティック** の2層で定義:

```css
@import "tailwindcss";

@theme {
  /* ===== 基礎スケール ===== */
  --color-brown-50:  #FAF7F2;
  --color-brown-100: #F5EEE4;
  --color-brown-200: #E8D9C4;
  --color-brown-300: #D4B896;
  --color-brown-400: #B8956A;
  --color-brown-500: #8B6D47;
  --color-brown-600: #6F5637;
  --color-brown-700: #543F2A;
  --color-brown-800: #3A2C1E;
  --color-brown-900: #2B1A0F;

  --color-cream-50:  #FFFCF7;
  --color-cream-100: #FFF8ED;
  --color-cream-200: #FDECD1;

  /* ===== セマンティック（実装時はこちらを優先） ===== */
  /* レイアウト */
  --color-background:       var(--color-brown-50);
  --color-surface:          #FFFFFF;
  --color-surface-elevated: #FFFFFF;
  --color-muted:            var(--color-brown-100);

  /* テキスト */
  --color-foreground:         var(--color-brown-900);
  --color-muted-foreground:   var(--color-brown-700);
  --color-subtle:             var(--color-brown-500);

  /* インタラクティブ */
  --color-primary:              var(--color-brown-500);
  --color-primary-hover:        var(--color-brown-600);
  --color-primary-foreground:   var(--color-brown-50);
  --color-secondary:            var(--color-cream-100);
  --color-secondary-foreground: var(--color-brown-800);
  --color-link:                 var(--color-brown-600);
  --color-link-hover:           var(--color-brown-700);

  /* 構造 */
  --color-border-default: var(--color-brown-200);
  --color-border-strong:  var(--color-brown-300);
  --color-input:          #FFFFFF;
  --color-border-input:   var(--color-brown-200);
  --color-ring-focus:     var(--color-brown-400);

  /* 状態 */
  --color-success:            #4A7C59;
  --color-success-foreground: #FFFFFF;
  --color-warning:            #C77F3E;
  --color-warning-foreground: #FFFFFF;
  --color-danger:             #A94438;
  --color-danger-foreground:  #FFFFFF;
  --color-info:               #5B7C99;
  --color-info-foreground:    #FFFFFF;
}
```

これにより Tailwind の `bg-primary`, `text-foreground`, `border-default` などが自動的に使えるようになる。

### Tailwind v3 の場合

`tailwind.config.ts` の extend で同じ2層構造を実現:

```typescript
export default {
  theme: {
    extend: {
      colors: {
        brown: {
          50:  '#FAF7F2', 100: '#F5EEE4', 200: '#E8D9C4', 300: '#D4B896',
          400: '#B8956A', 500: '#8B6D47', 600: '#6F5637', 700: '#543F2A',
          800: '#3A2C1E', 900: '#2B1A0F',
        },
        cream: { 50: '#FFFCF7', 100: '#FFF8ED', 200: '#FDECD1' },

        // セマンティック
        background:      '#FAF7F2',
        surface:         '#FFFFFF',
        muted:           '#F5EEE4',
        foreground:      '#2B1A0F',
        'muted-foreground': '#543F2A',
        subtle:          '#8B6D47',
        primary:         '#8B6D47',
        'primary-hover': '#6F5637',
        'primary-foreground': '#FAF7F2',
        secondary:       '#FFF8ED',
        'secondary-foreground': '#3A2C1E',
        link:            '#6F5637',
        'link-hover':    '#543F2A',
        'border-default': '#E8D9C4',
        'border-strong':  '#D4B896',
        input:           '#FFFFFF',
        'border-input':  '#E8D9C4',
        'ring-focus':    '#B8956A',
        success:         '#4A7C59', 'success-foreground': '#FFFFFF',
        warning:         '#C77F3E', 'warning-foreground': '#FFFFFF',
        danger:          '#A94438', 'danger-foreground':  '#FFFFFF',
        info:            '#5B7C99', 'info-foreground':    '#FFFFFF',
      },
    },
  },
}
```

---

## 5. 記述ルール

### 良い例

```tsx
<div className="p-4 md:p-6 lg:p-8 bg-brown-50 text-brown-900 border border-brown-200 rounded-lg">
  <h2 className="text-2xl font-bold text-brown-900 mb-4">見出し</h2>
  <p className="text-base text-brown-700">本文テキスト</p>
  <button className="mt-6 px-6 py-3 bg-brown-500 hover:bg-brown-600 text-brown-50 rounded-md">
    ボタン
  </button>
</div>
```

**チェック:**
- 余白: `p-4`(16px), `md:p-6`(24px), `lg:p-8`(32px), `mb-4`(16px), `mt-6`(24px), `px-6`(24px), `py-3`(12px 例外OK)
- テキスト: `text-2xl`, `text-base` (整数)
- 色: `bg-brown-50`, `text-brown-900`, `bg-brown-500` (すべてbrown系、blackなし)

### 悪い例

```tsx
<div className="p-5 bg-black text-black">        ❌ p-5(20px)禁止、black禁止
  <h2 className="text-[15px]">見出し</h2>          ❌ 15px（8倍数でも4/12でもない）
  <p style={{ padding: '13px' }}>本文</p>          ❌ インラインstyle禁止
</div>
```

### shadcn/ui の色調整

shadcn/ui はデフォルトで `slate` / `zinc` 系。導入時に以下を必ず実施:

1. `components.json` の `baseColor` は `neutral` を選ぶ
2. shadcn/ui が使う CSS 変数を、**上で定義したセマンティックトークンにマッピング**
3. すでにセマンティックが揃っているので、変数名を橋渡しするだけ

```css
:root {
  --background:          var(--color-background);
  --foreground:          var(--color-foreground);
  --card:                var(--color-surface);
  --card-foreground:     var(--color-foreground);
  --popover:             var(--color-surface-elevated);
  --popover-foreground:  var(--color-foreground);
  --primary:             var(--color-primary);
  --primary-foreground:  var(--color-primary-foreground);
  --secondary:           var(--color-secondary);
  --secondary-foreground: var(--color-secondary-foreground);
  --muted:               var(--color-muted);
  --muted-foreground:    var(--color-muted-foreground);
  --accent:              var(--color-muted);
  --accent-foreground:   var(--color-foreground);
  --destructive:         var(--color-danger);
  --destructive-foreground: var(--color-danger-foreground);
  --border:              var(--color-border-default);
  --input:               var(--color-border-input);
  --ring:                var(--color-ring-focus);
}
```

---

## 6. ダークモード

MVP初期は **未対応**。導入時は以下の方針:

- `dark:` プレフィックスで別トークンを適用
- ダークモードでも `#000` は使わず、`brown-900` を背景に、`brown-100` をテキストに
- あるいは deep-coffee 系の別スケールを用意

---

## 7. アクセシビリティ

### コントラスト比

- **本文テキスト:** `text-brown-900` on `bg-brown-50` → WCAG AA以上を目指す
- **ミュートテキスト:** `text-brown-500` on `bg-brown-50` → 副情報用のみ、重要情報には使わない
- カラーコントラストは https://webaim.org/resources/contrastchecker/ 等で検証

### focus リング

- shadcn/ui のデフォルト（`ring-2 ring-ring ring-offset-2`）を使う
- `--ring: var(--color-brown-400)` で暖色に統一

---

## 8. 実装後のセルフチェック

- [ ] `text-black` `bg-black` `#000` `#000000` を grep しても出てこないか
- [ ] 余白ユーティリティが 0/1/2/3/4/6/8/10/12/14/16/20/24 のみか
- [ ] 任意値 `[XXpx]` を使っていないか（使う場合8倍数）
- [ ] インライン style を使っていないか
- [ ] shadcn/ui コンポーネントの色調整を反映したか
- [ ] コントラスト比を確認したか

## 9. 例外ルール

- Google Maps 埋め込み等、外部SDKのUI: そのSDK側のスタイル運用に従う（強制不可）
- ライブラリ提供のアイコン: サイズは整数、色は Tailwind クラスで上書き
- 画像内の色は例外扱い（フィルタで加工しない）
