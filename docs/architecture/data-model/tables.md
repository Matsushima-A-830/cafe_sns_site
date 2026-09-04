# テーブル定義

Supabase (PostgreSQL) のスキーマ定義草案です。すべて `public` スキーマ想定。型・制約はMVP時点の想定であり、実装時に見直します。

## 目次

- [profiles](#profiles) — ユーザープロフィール
- [follows](#follows) — フォロー関係
- [blocks](#blocks) — ブロック関係
- [areas](#areas) — エリアマスタ（制覇マップ用）
- [cafes](#cafes) — カフェ情報
- [cafe_business_hours](#cafe_business_hours) — 営業時間
- [cafe_congestion_reports](#cafe_congestion_reports) — 混雑度レポート
- [cafe_owner_verifications](#cafe_owner_verifications) — 経営者認証申請
- [regular_customers](#regular_customers) — 常連認定（幹C）
- [posts](#posts) — 投稿
- [post_images](#post_images) — 投稿画像
- [drafts](#drafts) — 下書き
- [comments](#comments) — コメント
- [tags](#tags) — タグマスタ
- [post_tags](#post_tags) — 投稿タグ
- [likes](#likes) — いいね
- [user_cafe_lists](#user_cafe_lists) — お気に入り / 行きたい
- [post_bookmarks](#post_bookmarks) — 投稿保存
- [reports](#reports) — 通報
- [ng_words](#ng_words) — NGワード
- [notifications](#notifications) — 通知
- [badges](#badges) — バッジマスタ
- [user_badges](#user_badges) — ユーザー獲得バッジ
- [area_visits](#area_visits) — エリア訪問記録（制覇マップ）
- [audit_logs](#audit_logs) — 運営操作履歴

---

## profiles

Supabase Auth (`auth.users`) と 1:1 対応するプロフィール。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, FK → auth.users(id) | ユーザーID |
| username | citext | UNIQUE, NOT NULL | 表示用ID（英数字_） |
| display_name | text | NOT NULL | 表示名 |
| bio | text | | 自己紹介 |
| avatar_url | text | | アイコン画像URL |
| birth_date | date | NOT NULL | 生年月日（年齢確認必須） |
| status | text | NOT NULL, DEFAULT 'active' | active / pending_consent / suspended / deleted |
| guardian_email | text | | 保護者メール（未成年時） |
| guardian_consent_at | timestamptz | | 保護者同意日時 |
| role | text | NOT NULL, DEFAULT 'user' | user / owner / admin |
| home_area | text | | ホームエリア（初期タグサジェスト用） |
| metadata | jsonb | NOT NULL, DEFAULT '{}' | 拡張用 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**制約:**
- `CHECK (birth_date <= current_date - interval '13 years')` — 13歳未満は不可
- `CHECK (status IN ('active','pending_consent','suspended','deleted'))`

**RLS:**
- SELECT: 全ユーザー可（ただし `guardian_email`, `metadata` は View で除外して公開）
- INSERT: `auth.uid() = id`
- UPDATE: `auth.uid() = id`（`role`, `status` は admin のみ変更可）
- DELETE: 不可（`status='deleted'` で無効化）

---

## follows

| カラム | 型 | 制約 |
|---|---|---|
| follower_id | uuid | PK, FK → profiles(id) |
| followee_id | uuid | PK, FK → profiles(id) |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**制約:** `CHECK (follower_id <> followee_id)`

**インデックス:** `(followee_id, created_at DESC)` — フォロワー一覧用

**RLS:** SELECT 全ユーザー可 / INSERT・DELETE は本人（follower_id）のみ

---

## blocks

| カラム | 型 | 制約 |
|---|---|---|
| blocker_id | uuid | PK, FK → profiles(id) |
| blocked_id | uuid | PK, FK → profiles(id) |
| reason | text | |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**RLS:** SELECT・INSERT・DELETE は本人（blocker_id）のみ

**運用:** ブロック関係は投稿・コメント表示時にRLSで自動除外する（`NOT EXISTS` サブクエリ）

---

## cafes

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| name | text | NOT NULL | 店名 |
| name_kana | text | | フリガナ（検索用） |
| prefecture | text | NOT NULL | 都道府県 |
| city | text | NOT NULL | 市区町村 |
| area_code | text | FK → [areas](#areas)(code) | エリアコード（例: `JP-13-shibuya`）— マスタテーブル参照 |
| address | text | | 住所 |
| location | geography(POINT, 4326) | | 緯度経度 |
| phone | text | | |
| website | text | | |
| description | text | | 店舗説明 |
| external_ids | jsonb | NOT NULL, DEFAULT '{}' | 食べログ/Google Places 等 |
| verified_owner_id | uuid | FK → profiles(id) | 認証済みオーナー |
| status | text | NOT NULL, DEFAULT 'active' | active / closed / hidden |
| created_by | uuid | FK → profiles(id) | 登録者 |
| metadata | jsonb | NOT NULL, DEFAULT '{}' | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**インデックス:**
- `GIST(location)` — 地図検索
- `(prefecture, city, area_code)` — エリア絞り込み
- `(area_code)` — 制覇マップ集計との結合
- `GIN(name_kana gin_trgm_ops)` — フリガナ部分一致

**エリアコードの運用:**
- `cafes.area_code` は投稿トリガーで [`area_visits.area_code`](#area_visits) に伝搬される
- 東京45エリア（23区 + 副地域22）を初期セットとして採用（詳細: [seed/areas-initial-set.md](../../seed/areas-initial-set.md)）
- `area_code = NULL` のカフェは制覇マップに計上されない（意図的）

**RLS:**
- SELECT: `status = 'active'` を全ユーザー、その他は admin
- INSERT: 認証済みユーザー
- UPDATE: `verified_owner_id = auth.uid()` or admin
- DELETE: admin のみ

---

## areas

エリアマスタ。制覇マップ・検索フィルタで使う。**ISO 3166-2 準拠のコード体系**（都道府県は `JP-13` 等）。詳細な初期セットは [seed/areas-initial-set.md](../../seed/areas-initial-set.md) 参照。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| code | text | PK | 例: `JP-13-shibuya` |
| prefecture_code | text | NOT NULL | 例: `JP-13` (東京都) — ISO 3166-2 |
| slug | text | NOT NULL | 例: `shibuya`（URL・タグ用） |
| label | text | NOT NULL | 例: `渋谷` |
| label_kana | text | | 例: `シブヤ`（検索用） |
| parent_code | text | FK → areas(code) | 上位エリア（例: `JP-13-shibuya-ku` 配下に `JP-13-omotesando`） |
| center_location | geography(POINT, 4326) | | 地図中心座標 |
| priority | smallint | NOT NULL, DEFAULT 0 | 表示優先度（副都心系を上位に） |
| is_active | boolean | NOT NULL, DEFAULT true | 論理削除相当 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**制約:**
- `UNIQUE (prefecture_code, slug)` — 都道府県内でslug重複禁止
- `CHECK (code = prefecture_code || '-' || slug)` — コード整合性の自動チェック

**インデックス:**
- `(prefecture_code, priority DESC)` — 都道府県別の表示順
- `(parent_code)` — 階層ナビゲーション
- `GIST(center_location)` — 地図検索

**RLS:**
- SELECT: 全ユーザー (`is_active = true`)
- INSERT / UPDATE / DELETE: admin のみ

**運用:**
- コード変更は禁止（外部参照が壊れる）— 変更が必要なら `is_active=false` にして新コードを作る
- 階層の親子関係は 1階層のみ想定（過度な深さは避ける）
- MVP時点では東京45エリアで start（詳細: [seed/areas-initial-set.md](../../seed/areas-initial-set.md)）

---

## cafe_business_hours

| カラム | 型 | 制約 |
|---|---|---|
| cafe_id | uuid | PK, FK → cafes(id) |
| day_of_week | smallint | PK, CHECK BETWEEN 0 AND 6 |
| opens_at | time | |
| closes_at | time | |
| is_closed | boolean | NOT NULL, DEFAULT false |
| notes | text | |

**RLS:** SELECT 全ユーザー / 更新は cafes と同じ権限

---

## cafe_congestion_reports

ユーザー投稿による混雑度報告（1〜5段階）。

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| cafe_id | uuid | NOT NULL, FK → cafes(id) |
| user_id | uuid | NOT NULL, FK → profiles(id) |
| level | smallint | NOT NULL, CHECK BETWEEN 1 AND 5 |
| reported_at | timestamptz | NOT NULL, DEFAULT now() |

**インデックス:**
- `(cafe_id, reported_at DESC)` — 直近レポート表示用
- `(cafe_id, extract(dow from reported_at), extract(hour from reported_at))` — 曜日・時間帯別集計用

**RLS:** SELECT 全ユーザー / INSERT 認証済み / UPDATE・DELETE 不可

### 表示ロジック（決定 2026-09-03）

`S_CAFE_DETAIL` の混雑度セクションで、以下の3段階の表示切替を実装:

1. **直近30分以内のレポートあり** → 「今の混雑度」として直近平均を表示
2. **なければ** → 「同曜日同時間帯の過去4週間平均」を表示（`get_cafe_congestion_at()` Postgres関数）
3. **データ全くなし** → 「情報なし / 最初の報告者になろう」

**時間帯別グラフ:**
- 1週間分の折れ線グラフを常時表示（曜日 × 時間帯マトリクス）
- MVP時点では都度計算（Postgres関数）
- 投稿数が増えたら `cafe_congestion_hourly_avg` (Materialized View) に切替

### Postgres関数（MVP実装案）

```sql
-- 現在の混雑度（直近30分 or 過去平均へフォールバック）
create or replace function public.get_cafe_congestion_current(p_cafe_id uuid)
returns table (level_avg numeric, source text, sample_count int)
language sql stable as $$
  with recent as (
    select avg(level)::numeric as avg_level, count(*) as n
    from public.cafe_congestion_reports
    where cafe_id = p_cafe_id
      and reported_at >= now() - interval '30 minutes'
  ),
  historical as (
    select avg(level)::numeric as avg_level, count(*) as n
    from public.cafe_congestion_reports
    where cafe_id = p_cafe_id
      and extract(dow from reported_at) = extract(dow from now())
      and extract(hour from reported_at) between extract(hour from now())::int - 1
                                             and extract(hour from now())::int + 1
      and reported_at >= now() - interval '4 weeks'
  )
  select
    coalesce(recent.avg_level, historical.avg_level) as level_avg,
    case
      when recent.n > 0 then 'recent'
      when historical.n > 0 then 'historical'
      else 'none'
    end as source,
    coalesce(recent.n, historical.n, 0)::int as sample_count
  from recent, historical;
$$;
```

**将来（フェーズ2以降）:** Google Places API "popular times" 連携は [product/pending-items.md C系](../../product/pending-items.md) で検討。

---

## cafe_owner_verifications

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| user_id | uuid | NOT NULL, FK → profiles(id) |
| cafe_id | uuid | NOT NULL, FK → cafes(id) |
| status | text | NOT NULL, DEFAULT 'pending' |
| document_urls | jsonb | NOT NULL, DEFAULT '[]' |
| review_notes | text | |
| reviewed_by | uuid | FK → profiles(id) |
| created_at | timestamptz | NOT NULL, DEFAULT now() |
| reviewed_at | timestamptz | |

**制約:** `CHECK (status IN ('pending','approved','rejected'))`

**RLS:** SELECT は本人 + admin / INSERT 認証済み / UPDATE admin のみ

---

## regular_customers

オーナーが顧客に付与する「常連さん」認定（幹C）。ユーザー側は自分の「行きつけカフェ」として表示。

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) |
| cafe_id | uuid | PK, FK → cafes(id) |
| awarded_by | uuid | NOT NULL, FK → profiles(id) | 認定したオーナー |
| note | text | | オーナーからのメモ（任意） |
| awarded_at | timestamptz | NOT NULL, DEFAULT now() |
| revoked_at | timestamptz | | 取消時（NULL=有効） |

**インデックス:**
- `(cafe_id, awarded_at DESC)` — ダッシュボードでの一覧
- `(user_id) WHERE revoked_at IS NULL` — ユーザーの行きつけ一覧

**制約:** `CHECK (revoked_at IS NULL OR revoked_at >= awarded_at)`

**RLS:**
- SELECT: 全ユーザー（プロフィール表示用）— `revoked_at IS NULL` のみ
- INSERT: `awarded_by = auth.uid()` かつ 対象カフェの `verified_owner_id = auth.uid()`
- UPDATE: 認定オーナーのみ（`revoked_at` 設定で取消）
- DELETE: 不可（履歴保持）

**運用:**
- 通知: 認定時にユーザーへ `notifications.type = 'regular_awarded'` を送信
- バッジ: 3店舗以上で「行きつけコレクター」バッジ獲得（要 badges 追加）

---

## posts

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| author_id | uuid | NOT NULL, FK → profiles(id) | |
| cafe_id | uuid | FK → cafes(id) | 紐付くカフェ（任意） |
| post_type | text | NOT NULL, DEFAULT 'short' | short / blog |
| title | text | | ブログ形式時のみ必須（アプリ層で制御） |
| body_json | jsonb | NOT NULL | 本文（Tiptap JSON） |
| body_search | tsvector | GENERATED | 全文検索用（`tiptap_to_plaintext(body_json)` で抽出） |
| status | text | NOT NULL, DEFAULT 'published' | published / archived / hidden ※下書きは別テーブル `drafts` |
| visibility | text | NOT NULL, DEFAULT 'public' | public / followers |
| like_count | int | NOT NULL, DEFAULT 0 | トリガーで維持 |
| comment_count | int | NOT NULL, DEFAULT 0 | 同上 |
| bookmark_count | int | NOT NULL, DEFAULT 0 | 同上 |
| is_official | boolean | NOT NULL, DEFAULT false | 経営者による公式投稿フラグ（幹C） |
| official_format | text | | オーナー限定フォーマット: `tip` / `today_special` / `closure` / `new_menu` / NULL |
| metadata | jsonb | NOT NULL, DEFAULT '{}' | 社会的証明カウンタ等の追加余地 |
| published_at | timestamptz | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |
| deleted_at | timestamptz | | 論理削除 |

**制約:**
- `CHECK (status IN ('published','archived','hidden'))`
- `CHECK (official_format IS NULL OR official_format IN ('tip','today_special','closure','new_menu'))`
- `CHECK (is_official = false OR (cafe_id IS NOT NULL AND EXISTS (SELECT 1 FROM cafes WHERE id = cafe_id AND verified_owner_id = author_id)))` — is_official=true は認証済みオーナーのみ許可

**インデックス:**
- `(author_id, created_at DESC)`
- `(cafe_id, created_at DESC) WHERE cafe_id IS NOT NULL`
- `GIN(body_search)`
- `(published_at DESC) WHERE status='published' AND deleted_at IS NULL` — タイムライン

**RLS:**
- SELECT: `status='published' AND deleted_at IS NULL` かつ、閲覧者がブロックされていない
- INSERT: `auth.uid() = author_id` かつ profile.status='active'
- UPDATE: `auth.uid() = author_id`
- DELETE: `auth.uid() = author_id`（論理削除運用）

**本文サイズ上限:** `body_json` から抽出した平文は 50,000 文字以内とする（アプリ層で投稿前に検証）。Tiptap JSON 全体のバイトサイズは 512KB を上限の目安とする（画像は S3 保存のため base64 埋め込み禁止）。

**Tiptap JSON → 全文検索:**
`body_search` は `public.tiptap_to_plaintext(body_json)` で抽出した平文をインデックスする。関数は `type == "text"` のリーフノードを再帰的に結合して返す（IMMUTABLE必須）。

```sql
CREATE OR REPLACE FUNCTION public.tiptap_to_plaintext(doc jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT string_agg(leaf->>'text', ' ')
  FROM jsonb_path_query(doc, 'lax $.** ? (@.type == "text")') AS leaf
$$;
```

GENERATED カラムの定義例（`'japanese'` は PGroonga または手動 FTS 設定が必要。PGroonga 未導入時は `'simple'` を暫定利用）:
```sql
body_search tsvector GENERATED ALWAYS AS (
  to_tsvector('japanese',
    coalesce(public.tiptap_to_plaintext(body_json), '')
    || ' ' || coalesce(title, ''))
) STORED
```

**下書きの取り扱い:** 未公開の投稿は `posts` ではなく [`drafts`](#drafts) テーブルに保存。公開時に `drafts` から `posts` へ移送し、`drafts` は削除する。

---

## post_images

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| post_id | uuid | NOT NULL, FK → posts(id) ON DELETE CASCADE |
| storage_path | text | NOT NULL | S3キー |
| display_order | smallint | NOT NULL, DEFAULT 0 |
| width | int | |
| height | int | |
| alt_text | text | |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**アプリ層の責務:** アップロード時にEXIFを剥がしてからS3にPUTする（クライアント側でsharp/exifr等で処理）

**RLS:** SELECT 全ユーザー / INSERT・DELETE は post の作者

---

## drafts

下書き自動保存用。ブログ形式投稿の離脱防止（損失回避）。

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| author_id | uuid | NOT NULL, FK → profiles(id) |
| client_draft_key | text | NOT NULL | 端末側で発行するキー |
| payload | jsonb | NOT NULL | 投稿途中データ（`v`, post_type, title, body_json, tag_ids, image_paths, cafe_id） |
| last_saved_at | timestamptz | NOT NULL, DEFAULT now() |
| expires_at | timestamptz | NOT NULL, DEFAULT now() + interval '30 days' |

**制約:** `UNIQUE (author_id, client_draft_key)`

**`payload` スキーマ（バージョン管理あり）:**

```json
{
  "v": 1,
  "post_type": "short | blog",
  "title": "string | null",
  "body_json": { "type": "doc", "content": [] },
  "tag_ids": ["uuid"],
  "image_paths": ["string"],
  "cafe_id": "uuid | null"
}
```

`v` でスキーマバージョンを管理する。フォームのデータ構造変更時は `v` をインクリメントし、クライアント側でバージョン不一致の下書きは破棄して新規下書きとして扱う（サイレント破棄ではなく「古い下書きは使えません」のUI通知を推奨）。

**運用:** Supabase scheduled function または pg_cron で `expires_at < now()` を日次削除

**RLS:** SELECT・INSERT・UPDATE・DELETE すべて `auth.uid() = author_id`

---

## comments

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| post_id | uuid | NOT NULL, FK → posts(id) ON DELETE CASCADE |
| author_id | uuid | NOT NULL, FK → profiles(id) |
| parent_id | uuid | FK → comments(id) | 返信スレッド |
| body | text | NOT NULL |
| is_official | boolean | NOT NULL, DEFAULT false | オーナー公式返信フラグ（幹C） — UIで区別表示 |
| created_at | timestamptz | NOT NULL, DEFAULT now() |
| updated_at | timestamptz | NOT NULL, DEFAULT now() |
| deleted_at | timestamptz | |

**インデックス:** `(post_id, created_at)`

**RLS:**
- SELECT: `deleted_at IS NULL` かつブロック相手を除外
- INSERT: 認証済み。`is_official = true` は該当カフェの `verified_owner_id = auth.uid()` の場合のみ許可
- UPDATE: `auth.uid() = author_id`
- DELETE: 作者 or 投稿主（論理削除）

---

## tags

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| slug | text | UNIQUE, NOT NULL |
| label | text | NOT NULL |
| category | text | NOT NULL | area / mood / occasion / other |
| priority | smallint | NOT NULL, DEFAULT 0 | 表示優先度（高いほど先頭に出す）— 幹Aでシーンタグを最上位に |
| description | text | |
| usage_count | int | NOT NULL, DEFAULT 0 |
| is_curated | boolean | NOT NULL, DEFAULT false | 運営厳選タグ |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**RLS:** SELECT 全ユーザー / INSERT・UPDATE admin のみ（MVP）

**運用:** 「選択のパラドックス回避」の観点から、UIでは `is_curated=true` を優先表示、自由入力タグは制限（例: 1投稿5個まで）

---

## post_tags

| カラム | 型 | 制約 |
|---|---|---|
| post_id | uuid | PK, FK → posts(id) ON DELETE CASCADE |
| tag_id | uuid | PK, FK → tags(id) |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**インデックス:** `(tag_id, post_id)` — タグからの逆引き

**RLS:** SELECT 全ユーザー / INSERT・DELETE は post の作者

---

## likes

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) |
| post_id | uuid | PK, FK → posts(id) ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**運用:** トリガーで `posts.like_count` を維持。返報性通知のトリガーもここで発火（notifications INSERT）。

**RLS:** SELECT 全ユーザー / INSERT・DELETE は本人

---

## user_cafe_lists

お気に入り + 行きたい を統合。将来の拡張余地あり。

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) |
| cafe_id | uuid | PK, FK → cafes(id) |
| list_type | text | PK, NOT NULL |
| note | text | ユーザーメモ |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**制約:** `CHECK (list_type IN ('favorite','want_to_go'))`

**RLS:** SELECT・INSERT・DELETE は本人のみ

---

## post_bookmarks

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) |
| post_id | uuid | PK, FK → posts(id) ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**運用:** トリガーで `posts.bookmark_count` を維持

**RLS:** 本人のみ

---

## reports

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| reporter_id | uuid | NOT NULL, FK → profiles(id) |
| target_type | text | NOT NULL | post / comment / user / cafe |
| target_id | uuid | NOT NULL |
| reason | text | NOT NULL | spam / harassment / minor_risk / other |
| description | text | |
| status | text | NOT NULL, DEFAULT 'pending' | pending / reviewing / resolved / rejected |
| reviewer_id | uuid | FK → profiles(id) |
| resolution_notes | text | |
| created_at | timestamptz | NOT NULL, DEFAULT now() |
| resolved_at | timestamptz | |

**インデックス:** `(status, created_at)` — モデレーションキュー

**RLS:** SELECT 本人 + admin / INSERT 認証済み / UPDATE admin のみ

---

## ng_words

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| word | text | UNIQUE, NOT NULL |
| severity | text | NOT NULL, DEFAULT 'warn' | warn / block |
| category | text | | harassment / adult / spam / other |
| created_by | uuid | FK → profiles(id) |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**運用:** アプリ層で投稿・コメント作成時に単語一致チェック。`block` は保存拒否、`warn` は運営レビューキューに送る。

**RLS:** SELECT admin のみ / INSERT・UPDATE・DELETE admin のみ

---

## notifications

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| recipient_id | uuid | NOT NULL, FK → profiles(id) |
| actor_id | uuid | FK → profiles(id) |
| type | text | NOT NULL | like / comment / follow / mention / badge / owner_verified |
| entity_type | text | | post / comment / user 等 |
| entity_id | uuid | |
| payload | jsonb | NOT NULL, DEFAULT '{}' |
| read_at | timestamptz | |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**制約:** `CHECK (type IN ('like','comment','follow','mention','badge','owner_verified','regular_awarded'))`

**インデックス:** `(recipient_id, created_at DESC) WHERE read_at IS NULL` — 未読

**RLS:** SELECT・UPDATE は recipient のみ

---

## badges

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| code | text | UNIQUE, NOT NULL |
| name | text | NOT NULL |
| description | text | |
| icon_url | text | |
| criteria | jsonb | NOT NULL | 付与条件（訪問数等） |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**RLS:** SELECT 全ユーザー / INSERT admin のみ

---

## user_badges

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) |
| badge_id | uuid | PK, FK → badges(id) |
| awarded_at | timestamptz | NOT NULL, DEFAULT now() |
| context | jsonb | 付与時のコンテキスト |

**RLS:** SELECT 全ユーザー / INSERT はシステム（admin）のみ

---

## area_visits

エリア制覇マップ用。カフェへの投稿・保存を通じてエリア単位の訪問実績を集計。

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) |
| area_code | text | PK, FK → [areas](#areas)(code) | エリアコード（例: `JP-13-shibuya`） |
| first_visited_at | timestamptz | NOT NULL |
| last_visited_at | timestamptz | NOT NULL |
| visit_count | int | NOT NULL, DEFAULT 1 |

**運用:** posts INSERT時にトリガーで area_visits を upsert

**RLS:** SELECT 全ユーザー（プロフィール表示用） / INSERT・UPDATE はシステム

---

## audit_logs

運営操作の監査記録。

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| actor_id | uuid | FK → profiles(id) |
| action | text | NOT NULL |
| target_type | text | |
| target_id | uuid | |
| metadata | jsonb | NOT NULL, DEFAULT '{}' |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**RLS:** SELECT admin のみ / INSERT はシステム
