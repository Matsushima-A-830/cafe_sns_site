# Next.jsルーティング設計

Next.js 16 の App Router を前提とした、URL・ディレクトリ・レイアウトの設計。

## 設計方針

1. **SEO優先の閲覧系はSSR/ISR** — 未ログイン閲覧可能なページは全てサーバーレンダリング
2. **ロール別に route group で分離** — レイアウトと認可を group ごとに集約
3. **画面ID = ルート識別子** — [design/screen-flow.md](../design/screen-flow.md) の `S_*` を各 `page.tsx` にコメントとして残し、実装と設計をトレース可能に
4. **middleware で認可ゲート** — ページ側で個別の認可チェックを書かない
5. **Server Actions を主軸** — フォーム系ミューテーションはServer Actionsで実装、外部連携やWebhookのみRoute Handlers

## ロールとゲート方針

Supabase の `profiles.role` と `profiles.status` の2軸で権限を判定し、`profiles.onboarded_at` で導線を分ける。

| 権限概念 | 判定条件 | アクセス可能グループ |
|---|---|---|
| **guest** | セッションなし | `(browsing)`, `(auth)` |
| **pending** | セッションあり `status = 'pending_consent'` | `(browsing)`, `/account/pending`, `/settings/account`（メール変更・退会のみ） |
| **suspended** | `status = 'suspended'` | `/account/suspended` のみ |
| **onboarding** | `status = 'active'`, `onboarded_at IS NULL` | `(browsing)` + `/onboarding/*` のみ（`(user)` 以降は `/onboarding/profile` へ誘導） |
| **user** | `status = 'active'`, `onboarded_at IS NOT NULL`, `role = 'user'` | 上記 + `(user)` |
| **owner** | 同上 + `role = 'owner'` | 上記 + `(owner)` + `/new/official` |
| **admin** | 同上 + `role = 'admin'` | 上記 + `(admin)` |

**重要:**
- `role` と `status` は `profiles` テーブルの独立カラム。middleware ではこの2軸を必ず別変数として扱う
- **ルートグループと権限は 1:1 対応しない。** `/new/official`（S_POST_OFFICIAL）は `(user)` グループ配下にありながらオーナー権限が要る。権限の列挙は middleware 側を正とする

## ディレクトリ構造

```
app/
├── layout.tsx                       # ルートレイアウト（フォント、Provider、Analytics）
├── loading.tsx
├── error.tsx
├── not-found.tsx
├── robots.ts                        # /robots.txt (動的生成)
├── sitemap.ts                       # /sitemap.xml (動的生成)
│
├── (browsing)/                      # 未ログイン可・SSR/ISR
│   ├── layout.tsx                   # 共通ヘッダー + フッター
│   ├── page.tsx                     # / (S_HOME / S_MY_HOME 兼用)
│   ├── explore/
│   │   └── page.tsx                 # /explore (S_EXPLORE)
│   ├── map/
│   │   └── page.tsx                 # /map (S_MAP)
│   ├── search/
│   │   └── page.tsx                 # /search (S_SEARCH) — S_FILTER_*はDrawerで内包
│   ├── posts/
│   │   └── [id]/
│   │       ├── page.tsx             # /posts/[id] (S_POST_DETAIL)
│   │       ├── loading.tsx
│   │       └── not-found.tsx
│   ├── cafes/
│   │   ├── [id]/
│   │   │   ├── page.tsx             # /cafes/[id] (S_CAFE_DETAIL)
│   │   │   ├── loading.tsx
│   │   │   └── posts/
│   │   │       └── page.tsx         # /cafes/[id]/posts (タブ切替の詳細)
│   │   └── new/                     # 要ログイン (middlewareでガード)
│   │       └── page.tsx             # /cafes/new (S_CAFE_NEW)
│   └── users/
│       └── [username]/
│           ├── page.tsx             # /users/[username] (S_USER_PROFILE_PUBLIC)
│           └── posts/
│               └── page.tsx         # /users/[username]/posts (タブ)
│
├── (auth)/                          # 認証・オンボーディング
│   ├── layout.tsx                   # 中央寄せカードレイアウト、ナビ非表示
│   ├── login/
│   │   └── page.tsx                 # /login (S_LOGIN)
│   ├── signup/
│   │   ├── page.tsx                 # /signup (S_SIGNUP step1: 認証情報)
│   │   ├── verify/
│   │   │   └── page.tsx             # /signup/verify (step2: OTP)
│   │   ├── birthdate/
│   │   │   └── page.tsx             # /signup/birthdate (step3: 生年月日)
│   │   ├── consent/
│   │   │   └── page.tsx             # /signup/consent (S_MINOR_CONSENT)
│   │   └── blocked/
│   │       └── page.tsx             # /signup/blocked (S_SIGNUP_BLOCKED)
│   ├── account/
│   │   ├── pending/
│   │   │   └── page.tsx             # /account/pending (S_ACCOUNT_PENDING)
│   │   └── suspended/
│   │       └── page.tsx             # /account/suspended (S_ACCOUNT_SUSPENDED)
│   └── onboarding/
│       ├── layout.tsx               # プログレスバー
│       ├── profile/page.tsx         # /onboarding/profile (S_ONBOARD_PROFILE)
│       ├── area/page.tsx            # /onboarding/area (S_ONBOARD_AREA)
│       └── interests/page.tsx       # /onboarding/interests (S_ONBOARD_INTERESTS)
│
├── (user)/                          # 要ログイン
│   ├── layout.tsx                   # サイドナビ + ボトムナビのアプリシェル
│   ├── me/
│   │   ├── page.tsx                 # /me (S_MYPAGE)
│   │   ├── edit/page.tsx            # /me/edit (S_PROFILE_EDIT)
│   │   ├── favorites/page.tsx       # /me/favorites (S_FAVORITES)
│   │   ├── want-to-go/page.tsx      # /me/want-to-go (S_WANT_TO_GO)
│   │   ├── bookmarks/page.tsx       # /me/bookmarks (S_BOOKMARKS)
│   │   ├── drafts/page.tsx          # /me/drafts (S_DRAFTS)
│   │   └── badges/page.tsx          # /me/badges (S_BADGES)
│   ├── notifications/
│   │   └── page.tsx                 # /notifications (S_NOTIFICATIONS)
│   ├── settings/
│   │   ├── page.tsx                 # /settings (S_SETTINGS 索引)
│   │   ├── account/
│   │   │   ├── page.tsx             # /settings/account
│   │   │   └── delete/page.tsx      # /settings/account/delete (S_ACCOUNT_DELETE)
│   │   ├── privacy/page.tsx         # /settings/privacy
│   │   ├── notifications/page.tsx   # /settings/notifications
│   │   ├── display/page.tsx         # /settings/display
│   │   └── blocked/page.tsx         # /settings/blocked (S_BLOCKED_USERS)
│   ├── new/
│   │   ├── page.tsx                 # /new (形式選択シート)
│   │   ├── short/page.tsx           # /new/short (S_POST_SHORT)
│   │   ├── blog/page.tsx            # /new/blog (S_POST_BLOG)
│   │   ├── official/                # S_POST_OFFICIAL (要オーナー権限)
│   │   │   ├── page.tsx             # /new/official (フォーマット選択)
│   │   │   ├── today-special/page.tsx
│   │   │   ├── tip/page.tsx
│   │   │   ├── closure/page.tsx
│   │   │   └── new-menu/page.tsx
│   │   └── success/page.tsx         # /new/success (S_POST_SUCCESS)
│   └── report/
│       └── [targetType]/
│           └── [id]/
│               └── page.tsx         # /report/post/xxx 等 (S_REPORT_FORM)
│
├── (owner)/                         # 経営者
│   ├── layout.tsx                   # 経営者ダッシュボードシェル
│   └── owner/
│       ├── claim/
│       │   └── [cafeId]/
│       │       └── page.tsx         # /owner/claim/[cafeId] (S_OWNER_CLAIM)
│       ├── pending/
│       │   └── page.tsx             # /owner/pending (S_OWNER_PENDING)
│       └── [cafeId]/
│           ├── page.tsx             # /owner/[cafeId] (S_OWNER_DASHBOARD)
│           ├── edit/page.tsx        # /owner/[cafeId]/edit (S_OWNER_CAFE_EDIT)
│           ├── analytics/page.tsx   # /owner/[cafeId]/analytics (S_OWNER_ANALYTICS)
│           └── regulars/page.tsx    # /owner/[cafeId]/regulars (S_OWNER_REGULARS)
│
├── (admin)/                         # 運営管理（MVP最小構成）
│   ├── layout.tsx
│   └── admin/
│       ├── reports/
│       │   ├── page.tsx             # /admin/reports (S_ADMIN_REPORTS 通報キュー)
│       │   └── [id]/page.tsx        # /admin/reports/[id] (S_ADMIN_REVIEW 個別レビュー)
│       ├── verifications/
│       │   ├── page.tsx             # /admin/verifications (オーナー認証審査キュー)
│       │   └── [id]/page.tsx        # /admin/verifications/[id] (S_ADMIN_OWNER_REVIEW)
│       └── ng-words/page.tsx        # /admin/ng-words (NGワード管理)
│
└── api/                             # Route Handlers
    ├── auth/
    │   └── callback/route.ts        # Supabase Auth コールバック
    ├── uploads/
    │   └── sign/route.ts            # Storage 署名付きアップロードURL発行
    ├── webhooks/
    │   ├── consent/route.ts         # 保護者同意リンク処理
    │   └── stripe/route.ts          # 将来: 決済Webhook
    └── revalidate/route.ts          # 手動 ISR revalidation
```

## URLとスクリーンIDの対応表

| Screen ID | URL | レンダリング |
|---|---|---|
| S_HOME / S_MY_HOME | `/` | SSR（認証状態で分岐） |
| S_EXPLORE | `/explore` | SSR ※ISR (60s) を想定していたが、S_POST_DETAIL と同じ理由で断念（[pending-items D23](../product/pending-items.md)） |
| S_MAP | `/map` | SSR（Client Component主体） |
| S_SEARCH | `/search` | SSR |
| S_POST_DETAIL | `/posts/[id]` | SSR ※ISR (300s) を想定していたが未達（[pending-items D23](../product/pending-items.md)） |
| S_CAFE_DETAIL | `/cafes/[id]` | ISR (300s) |
| S_USER_PROFILE_PUBLIC | `/users/[username]` | ISR (60s) |
| S_LOGIN | `/login` | SSR |
| S_SIGNUP (1〜3) | `/signup` `/signup/verify` `/signup/birthdate` | SSR |
| S_SIGNUP_BLOCKED | `/signup/blocked` | Static |
| S_MINOR_CONSENT | `/signup/consent` | SSR |
| S_ACCOUNT_PENDING | `/account/pending` | SSR |
| S_ACCOUNT_SUSPENDED | `/account/suspended` | SSR |
| S_ONBOARD_* | `/onboarding/{profile,area,interests}` | SSR |
| S_MYPAGE | `/me` | SSR |
| S_PROFILE_EDIT | `/me/edit` | SSR |
| S_FAVORITES | `/me/favorites` | SSR |
| S_WANT_TO_GO | `/me/want-to-go` | SSR |
| S_BOOKMARKS | `/me/bookmarks` | SSR |
| S_DRAFTS | `/me/drafts` | SSR |
| S_BADGES | `/me/badges` | SSR |
| S_NOTIFICATIONS | `/notifications` | SSR |
| S_SETTINGS | `/settings` | SSR |
| S_BLOCKED_USERS | `/settings/blocked` | SSR |
| S_POST_SHORT | `/new/short` | SSR |
| S_POST_BLOG | `/new/blog` | SSR |
| S_POST_SUCCESS | `/new/success` | SSR |
| S_REPORT_FORM | `/report/[targetType]/[id]` | SSR |
| S_OWNER_CLAIM | `/owner/claim/[cafeId]` | SSR |
| S_OWNER_PENDING | `/owner/pending` | SSR |
| S_OWNER_DASHBOARD | `/owner/[cafeId]` | SSR |
| S_OWNER_CAFE_EDIT | `/owner/[cafeId]/edit` | SSR |
| S_OWNER_ANALYTICS | `/owner/[cafeId]/analytics` | SSR |
| S_OWNER_REGULARS | `/owner/[cafeId]/regulars` | SSR |
| S_POST_OFFICIAL | `/new/official` (+ サブルート4種) | SSR（要オーナー権限） |
| S_CAFE_NEW | `/cafes/new` | SSR（要ログイン） |
| S_ACCOUNT_DELETE | `/settings/account/delete` | SSR |
| S_FILTER_AREA / _MOOD / _OCCASION / _KEYWORD | `/search`（Drawer内包） | SSR |
| S_SEARCH_RESULT | `/search?...`（クエリで結果） | SSR |
| S_ADMIN_REPORTS | `/admin/reports` | SSR |
| S_ADMIN_REVIEW | `/admin/reports/[id]` | SSR |
| S_ADMIN_OWNER_REVIEW | `/admin/verifications/[id]` | SSR |
| S_EXPLORE_DEFAULT / S_MAP_CARD / S_ACCOUNT_ACTIVATED | 独立ルートなし | 上位画面内の状態 |

## middleware.ts 設計

**配置はプロジェクトルートの `middleware.ts`**（`src/` 構成なら `src/middleware.ts`）。`app/middleware.ts` は Next.js に認識されない。
ここで全リクエストを傍受し、ロールベースのリダイレクトを一元管理する。

```
擬似コード:

function middleware(req):
  session = await getSupabaseSession(req)
  path    = req.nextUrl.pathname

  // ---- 状態の抽出（role / status / onboarded は必ず別変数）----
  const isAuthed  = session != null
  const meta      = isAuthed ? session.claims.app_metadata : {}  // 下記 Hook が差し込む
  const role      = meta.role      ?? null   // 'user' | 'owner' | 'admin'
  const status    = meta.status    ?? null   // 'active' | 'pending_consent' | 'suspended' | 'deleted'
  const onboarded = meta.onboarded ?? false  // profiles.onboarded_at IS NOT NULL

  // ---- 停止・削除アカウントは即座に隔離 ----
  if (isAuthed && status === 'suspended'):
    if (path !== '/account/suspended'):
      return redirect('/account/suspended')
    return next()
  if (isAuthed && status === 'deleted'):
    return redirect('/login')  // セッション破棄も併せて実施

  // ---- 保護されたルート ----
  const requiresAuth =
    path.startsWith('/me') ||
    path.startsWith('/notifications') ||
    path.startsWith('/settings') ||
    path.startsWith('/new') ||
    path.startsWith('/report') ||
    path.startsWith('/cafes/new') ||
    path.startsWith('/onboarding')

  if (requiresAuth):
    if (!isAuthed):
      return redirect('/login?next=' + path)
    if (status === 'pending_consent' && !path.startsWith('/account/pending')):
      return redirect('/account/pending')

  // ---- オンボーディング未完了は /onboarding に閉じ込める ----
  // S_ONBOARD_INTERESTS はスキップ不可（幹A）。ここが唯一の強制ポイント
  if (isAuthed && status === 'active' && !onboarded):
    if (requiresAuth && !path.startsWith('/onboarding')):
      return redirect('/onboarding/profile')
  // 閲覧系 (browsing) は未完了でも通す。回遊を止めると離脱するため

  // ---- オーナー限定 ----
  // 注意: オーナー限定エリアは /owner 配下だけではない。
  //       /new/official (S_POST_OFFICIAL) は (user) グループ配下にあるため個別に列挙する
  const isOwnerArea =
    (path.startsWith('/owner')
      && path !== '/owner/pending'
      && !path.startsWith('/owner/claim'))   // claim申請自体は user でも可
    || path.startsWith('/new/official')

  if (isOwnerArea):
    if (!isAuthed) return redirect('/login?next=' + path)
    if (role !== 'owner' && role !== 'admin') return redirect('/')

  // ---- 管理者限定 ----
  if (path.startsWith('/admin')):
    if (role !== 'admin') return notFound()  // 存在自体を隠す

  // ---- 既ログイン → /login /signup にアクセス ----
  if ((path === '/login' || path.startsWith('/signup')) && isAuthed && status === 'active'):
    return redirect(onboarded ? '/me' : '/onboarding/profile')

  return next()
```

**運用ポイント:**
- `middleware.ts` は Edge Runtime で動くため、DBアクセスは避け、JWT 内のカスタムクレイム（`role` / `status` / `onboarded`）だけで判定
- role と status は独立軸なので、両方を組み合わせて認可判定する
- **オーナー限定エリアの列挙は middleware に一元化する。** ルートグループ (`(owner)`) と権限は 1:1 対応しない（`/new/official` が反例）ため、「グループ = 権限」と考えない

### カスタムクレイムの同期方式

`role` / `status` / `onboarded` は **Supabase の Custom Access Token Hook**（Postgres 関数）で発行時に `profiles` から読んで JWT に載せる。

```sql
-- 例: access token 発行のたびに profiles の現在値を claims に差し込む
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  p record;
begin
  select role, status, (onboarded_at is not null) as onboarded
    into p
  from public.profiles
  where id = (event->>'user_id')::uuid;

  -- サインアップ直後（生年月日入力前）は profiles 行がまだ無い
  if not found then return event; end if;

  return jsonb_set(event, '{claims,app_metadata}',
    coalesce(event->'claims'->'app_metadata', '{}'::jsonb) || to_jsonb(p));
end $$;
```

**`raw_app_meta_data` を profiles のトリガーで書き換える方式は採らない。** 書き換えても既発行のアクセストークンは失効せず、次のリフレッシュ（既定1時間）まで古い値が残るため。

**それでもクレイムには反映遅延がある**（アクセストークンの寿命ぶん）。したがって:

- **middleware のロール判定は「UXのための誘導」であり、認可の最終防衛線ではない**
- 実際の認可は常に **RLS が担保する**（[data-model/README.md](./data-model/README.md#rlsポリシー方針概要)）。`suspended` 化・ブロック・通報対応は RLS 側で即時に効く
- 即時のセッション遮断が必要なケース（アカウント停止）は、admin 操作時に Supabase Admin API でリフレッシュトークンを失効させる

## 共通レイアウトの責務

### `app/layout.tsx`（ルート）

- `<html lang="ja">`, `<body>`
- フォント読み込み（Noto Sans JP等）
- Analytics（Vercel Analytics / GA4）
- グローバルProvider（テーマ、Tanstack Query、Supabase Client）

### `app/(browsing)/layout.tsx`

- 共通ヘッダー（未ログイン時は「ログイン」ボタン、ログイン時は通知アイコン等）
- フッター（利用規約・特商法など）
- モバイルはボトムナビあり（未ログイン用簡易版）

### `app/(auth)/layout.tsx`

- 中央寄せカード（480px幅）
- ヘッダー・フッター非表示
- 背景に淡いカフェイメージ

### `app/(auth)/onboarding/layout.tsx`

- ネストしたレイアウト。上部に横型プログレスバー（1/3, 2/3, 3/3）

### `app/(user)/layout.tsx`

- サイドナビ（PC・タブレット） + ボトムナビ（モバイル）
- 右補助カラム（`lg:` 以上で表示）はページごとに切替可能

### `app/(owner)/layout.tsx`

- 経営者ダッシュボード用のサイドナビ（一般とは別メニュー）
- 上部にカフェ選択ドロップダウン（複数店舗持ちオーナー用）

### `app/(admin)/layout.tsx`

- 管理画面専用のシンプルなレイアウト
- ロール確認は middleware で実施済み

## Server Actions 分割

主要ミューテーションはServer Actionsを使う。ファイル配置は機能単位で `app/_actions/` にまとめる。

```
app/_actions/
├── posts.ts          # reservePost, createPost, updatePost, deletePost, publishDraft
├── comments.ts       # createComment, deleteComment
├── likes.ts          # toggleLike
├── bookmarks.ts      # toggleBookmark
├── cafeLists.ts      # addToList, removeFromList (favorite / want_to_go)
├── follows.ts        # toggleFollow
├── reports.ts        # createReport
├── blocks.ts         # toggleBlock
├── profiles.ts       # updateProfile, updateAvatar
├── drafts.ts         # saveDraft, deleteDraft (autosave)
├── notifications.ts  # markAsRead, markAllAsRead
├── owner.ts          # claimCafe, withdrawClaim, updateCafeInfo,
│                     # awardRegular, revokeRegular, updateRegularNote (幹C)
└── admin.ts          # resolveReport, approveOwnerClaim, rejectOwnerClaim
```

**注意:**
- `awardRegular` は `regular_customers` INSERT に加えて、`notifications.type = 'regular_awarded'` の送信と `checkAndAwardBadges(userId, 'REGULAR_AWARDED')` の呼び出しを担う（[data-model/README.md](./data-model/README.md#バッジ付与ロジックの設計)）
- 公式投稿の公開時は `posts.ts` から `notifications.type = 'official_post'` を、当該カフェを「お気に入り」「行きたい」に入れているユーザーへ送る
- Server Actionsからは Supabase Server Client を使用（RLS + auth コンテキスト）
- 認可はRLSに委譲、Server Action側では入力バリデーションのみ
- 楽観更新はTanstack Query + Server Actions で

## Route Handlers（`app/api/`）

Server Actionsで代替できないものだけを Route Handlers で実装。

| エンドポイント | 用途 |
|---|---|
| `POST /api/auth/callback` | Supabase Auth のリダイレクト受け |
| `POST /api/uploads/sign` | Supabase Storage の署名付きアップロードURL発行（クライアントから直PUT）。サイズ・MIME・パス規約の検証をここで通す |
| `POST /api/webhooks/consent` | 保護者同意リンククリック処理（ワンタイムトークン検証） |
| `POST /api/revalidate` | 手動 ISR revalidation（管理者用） |

## 特殊ファイル配置

| ファイル | 配置場所 | 用途 |
|---|---|---|
| `loading.tsx` | 各主要ルート | Suspense fallback（スケルトンUI） |
| `error.tsx` | 各グループのlayout付近 | エラーバウンダリ |
| `not-found.tsx` | `app/`, `posts/[id]/`, `cafes/[id]/` 等 | 404画面 |
| `robots.ts` | `app/robots.ts` | クローラ制御。管理・オーナー画面はDisallow |
| `sitemap.ts` | `app/sitemap.ts` | 公開投稿・カフェを含む動的サイトマップ |
| `manifest.ts` | `app/manifest.ts` | PWA用（アプリ化を見据えて早めに用意） |

## MVPで採用しない予定の機能

以下は Next.js App Router の高度な機能。実装後に必要性が明確になってから追加する。

- **Parallel Routes（`@modal` 等）** — モーダル表示に便利だが、まずは通常ルート + shadcn Dialog で十分
- **Intercepting Routes（`(.)`, `(..)`）** — 「一覧からモーダルで詳細表示、直接URLでもフルページ表示」の実現に有用。写真ライトボックス等で後日採用検討
- **Server-only import 制約 (`server-only`)** — 段階的に導入
- **Streaming (`Suspense` 分割)** — ダッシュボード等で後日採用

## メタデータ・OG設計

SEO とシェア導線のため、以下のページで動的メタデータを設定:

- `/posts/[id]`: 投稿タイトル or 冒頭 + 1枚目画像
- `/cafes/[id]`: カフェ名 + 説明 + メイン画像（`cafes.main_image_path`。未設定なら最新投稿の1枚目にフォールバック）
- `/users/[username]`: 表示名 + bio + アバター
- `/`: サイトタイトル + キャッチコピー

```
// 例: app/(browsing)/posts/[id]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.id)
  return {
    title: post.title ?? post.body.slice(0, 30),
    description: post.body.slice(0, 120),
    openGraph: {
      images: [post.images[0]?.url],
      type: 'article',
    },
  }
}
```

## 未確定事項（実装時に判断）

以下は実装フェーズ入り後に決定:

- 認証状態の同期方法（`revalidatePath` vs `revalidateTag` vs `router.refresh`）
- Supabase Realtime を使う画面の範囲（通知バッジ、コメント等）
- グローバルモーダル・トーストのProvider設計
- i18n（現状日本語のみでOKだが、将来英語対応を見据えて `next-intl` を最初から入れるか）
