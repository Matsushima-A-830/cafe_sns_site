# テーブル定義

Supabase (PostgreSQL) のスキーマ定義草案です。すべて `public` スキーマ想定。型・制約はMVP時点の想定であり、実装時に見直します。

## 目次

- [profiles](#profiles) — ユーザープロフィール
- [user_settings](#user_settings) — ユーザー設定（通知・プライバシー・表示）
- [user_interest_tags](#user_interest_tags) — 好きな気分（オンボーディング / 幹A）
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
| guardian_consent_token_hash | text | UNIQUE（部分インデックス、NULL除外） | 保護者同意リンクのワンタイムトークンのSHA-256ハッシュ。生の値はメールにのみ存在しDBには置かない。承認後null（B3） |
| guardian_consent_token_expires_at | timestamptz | | guardian_consent_token_hash の有効期限（発行から7日） |
| guardian_consent_token_issued_at | timestamptz | | 再発行クールダウン判定専用の発行時刻。expires_atからの逆算だとTTL定数変更に弱いため独立列にした（B3） |
| role | text | NOT NULL, DEFAULT 'user' | user / owner / admin |
| home_area_code | text | FK → [areas](#areas)(code) | ホームエリア（初期タグサジェスト用）— マスタ参照 |
| onboarded_at | timestamptz | | オンボーディング完了日時（NULL = 未完了） |
| metadata | jsonb | NOT NULL, DEFAULT '{}' | 拡張用 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**`home_area_code` を FK にする理由:** エリアの正は [`areas` マスタ](#areas)（[glossary.md](../../glossary.md)）。自由テキストで持つと `cafes.area_code` / `area_visits.area_code` とコード体系がずれ、ホームエリア起点のレコメンドが結合できなくなる。

**`onboarded_at` の役割:** `S_ONBOARD_INTERESTS` はスキップ不可（幹A）。middleware がオンボーディング未完了ユーザーを `/onboarding` へ誘導するための唯一の判定材料であり、JWT カスタムクレームにも載せる（[routing.md](../routing.md#middlewarets-設計)）。`/onboarding/interests` の完了時にのみ `now()` を書き込む。

**制約:**
- `CHECK (status IN ('active','pending_consent','suspended','deleted'))`
- `CHECK (role IN ('user','owner','admin'))`
- 13歳未満のブロックは **BEFORE INSERT OR UPDATE トリガー**で実装する。`current_date` は IMMUTABLE ではないため CHECK 制約には書けない:
  ```sql
  CREATE OR REPLACE FUNCTION public.enforce_min_age() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.birth_date > current_date - interval '13 years' THEN
      RAISE EXCEPTION 'AGE_RESTRICTED';
    END IF;
    RETURN NEW;
  END $$;
  ```
  アプリ層（サインアップの Zod スキーマ）でも同じ判定を行い、二重にガードする

**RLS:**
- SELECT: 全ユーザー可（ただし `guardian_email`, `metadata` は View で除外して公開）
- INSERT: `auth.uid() = id`
- UPDATE: `auth.uid() = id`（`role`, `status` は admin のみ変更可。`username` は本人・admin ともに変更不可）
- DELETE: 不可（`status='deleted'` で無効化）

**`role` / `status` / `username` の保護は BEFORE UPDATE トリガー（`guard_privileged_profile_columns`）で行う。**
RLS の `WITH CHECK` は OLD 行を参照できず「どの列が変わったか」を判定できないため。
`username` は admin にも例外を設けない（管理画面に変更UIが存在しないため。将来モデレーション目的で
必要になれば専用の Server Action として別途設計する）。
このトリガーは **`auth.uid()` が NULL のとき素通りする** — service_role と直接接続を巻き込むと、
本番に最初の admin を作る手段が消えるため（[pending-items A9](../../product/pending-items.md)）。

**最初の admin:** ローカルは `seed.sql`、本番は service_role での手動昇格
（[deployment.md #本番の最初の-admin-を作る](../../operations/deployment.md)）。

**`approve_guardian_consent(p_token)`（B3）:** 保護者同意リンクの承認RPC。`security definer` かつ
`anon, authenticated` に grant — 保護者は未ログインでメールのリンクをクリックするため。
`guard_privileged_profile_columns` トリガーが `auth.uid() が NULL なら素通り` する設計を利用しており、
このRPC自身が受け取った生トークンをハッシュ化して `guardian_consent_token_hash` と照合し、
`guardian_consent_token_expires_at > now()`・`status = 'pending_consent'` を含めた3条件だけで
認可する（RLSはSECURITY DEFINERでバイパスされるため、この3条件が唯一の防御線）。
`profiles_select_all` は `using(true)` で列を絞れないため、生トークンをそのまま保存すると
anon の直接読み出しで盗まれメールを介さず承認を偽装できてしまう——だからハッシュだけを持つ。
成功時は `status` を `active` にし、ハッシュを `null` に戻して再利用を防ぐ。
呼び出し元は `GET /api/consent/confirm?token=...`（[routing.md](../routing.md)）。

---

## user_settings

`S_SETTINGS` の永続化項目。**`profiles.metadata` の jsonb ではなく型付きの1:1テーブルにする**（決定 2026-09-05）。通知トリガーが SQL から直接参照するため、jsonb だと毎回のキャストとキー欠落の考慮が必要になり、型と DEFAULT で守れなくなるのが理由。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| user_id | uuid | PK, FK → profiles(id) ON DELETE CASCADE | |
| notify_like | boolean | NOT NULL, DEFAULT true | いいね通知 |
| notify_comment | boolean | NOT NULL, DEFAULT true | コメント通知 |
| notify_follow | boolean | NOT NULL, DEFAULT true | フォロー通知 |
| notify_email | boolean | NOT NULL, DEFAULT true | メールでも通知するか |
| use_location | boolean | NOT NULL, DEFAULT true | 位置情報の使用（タグサジェスト等） |
| allow_recommendation | boolean | NOT NULL, DEFAULT true | おすすめ表示に行動履歴を活用してよいか |
| font_scale | text | NOT NULL, DEFAULT 'normal' | 文字サイズ: small / normal / large |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**制約:** `CHECK (font_scale IN ('small','normal','large'))`

**行の作成:** `profiles` INSERT 時のトリガーで既定値の行を同時に作る。アプリ側は「行が無い」を考慮しなくてよい。

**通知トグルの効かせ方:** `notifications` を INSERT するトリガー（[likes](#likes) / [comments](#comments) / [follows](#follows)）は、**INSERT 前に `user_settings` を見て該当フラグが false なら通知行を作らない**。作ってから隠す方式にしない（未読カウントが合わなくなるため）。

**`notify_email` の位置づけ:** MVP でメール通知は実装しない（[pending-items B7](../../product/pending-items.md)）。列だけ先に置き、既定 true のまま未使用とする。

**RLS:** SELECT・INSERT・UPDATE すべて `auth.uid() = user_id` / DELETE 不可（profiles 削除に追随）

---

## user_interest_tags

オンボーディング `S_ONBOARD_INTERESTS` で選ぶ「好きな気分」。**幹A（気分起点の発見）のレコメンドはこの行を入力にする。**

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) ON DELETE CASCADE |
| tag_id | uuid | PK, FK → tags(id) |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**インデックス:** `(tag_id, user_id)` — 「同じ気分の人」の逆引き

**個数の上限:** UIは1〜5個。DB でも上限を担保する（[post_tags の5個上限](../../product/pending-items.md#d4-post_tags-の5個上限のdb制約) と同じ方式の BEFORE INSERT トリガー）。**最低1個**はオンボーディング完了条件（`profiles.onboarded_at`）側で担保し、DB制約にはしない（選択と完了フラグ書き込みの間に一瞬0件の状態があるため）。

**category の制限:** 選択できるのは `tags.category IN ('occasion','mood')` のみ（ワイヤーフレームの2タブに対応）。BEFORE INSERT トリガーで弾く。

**RLS:**
- SELECT: 全ユーザー（「同じ気分の人」の集計に使うため）
- INSERT・DELETE: `auth.uid() = user_id`
- UPDATE: 不可（付け替えは DELETE + INSERT）

**変更UI:** MVP ではオンボーディング後に編集する画面を持たない。編集導線は `S_PROFILE_EDIT` への追加として後続で検討する。

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
| area_code | text | FK → [areas](#areas)(code) | エリアコード（例: `JP-13-shibuya-ku`）— マスタテーブル参照 |
| address | text | | 住所 |
| main_image_path | text | | メイン画像（Supabase Storage の `cafe-images` オブジェクトパス） |
| location | geography(POINT, 4326) | | 緯度経度 |
| phone | text | | |
| website | text | | |
| description | text | | 店舗説明 |
| external_ids | jsonb | NOT NULL, DEFAULT '{}' | `{ google_place_id?: string, tabelog_url?: string }`。キー名は S_OWNER_CAFE_EDIT 実装時に固定（lib/validators/cafes.ts の externalIdsSchema） |
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

**`main_image_path` の用途:** `S_CAFE_DETAIL` のヒーロー画像、`S_OWNER_CAFE_EDIT` の「メイン画像」、`/cafes/[id]` の OG 画像がすべてこの1列を参照する。**複数枚を持つ `cafe_images` テーブルは作らない** — カフェの写真はユーザー投稿（[post_images](#post_images)）が主で、店側が持つのは看板1枚で足りる（3回同じ要求が出てから拡張を検討する）。未設定時は当該カフェの最新投稿の1枚目にフォールバックする。

**エリアコードの運用:**
- `cafes.area_code` は投稿トリガーで [`area_visits.area_code`](#area_visits) に伝搬される
- 東京45エリア（23区 + 副地域22）を初期セットとして採用（詳細: [seed/areas-initial-set.md](../../seed/areas-initial-set.md)）
- `area_code = NULL` のカフェは制覇マップに計上されない（意図的）

**RLS:**
- SELECT: `status = 'active'` を全ユーザー、その他は admin
- INSERT: 認証済みユーザー（`status='active'` 必須）
- UPDATE: `verified_owner_id = auth.uid()`（`status='active'` 必須）or `created_by = auth.uid() and verified_owner_id is null`（`status='active'` 必須、未認証オーナー期間中の本人編集。[pending-items B8](../../product/pending-items.md#b8-登録者本人がカフェ情報を編集できない未認証オーナー期間中--解消済2026-09-20)） or admin
- DELETE: admin のみ

**SELECT RLS のバイパス（本人の自店閲覧）:** 上記 SELECT は `status='active'` しか見せないため、
素朴な select だとカフェ本人（`verified_owner_id`）が closed/hidden にした瞬間、自分でも
見えなくなってしまう（「臨時休業を告知したいまさにその状況で告知できない」という本末転倒）。
以下の security definer 関数が本人に限り status を問わず個別にバイパスする（ポリシー自体は変えない）:
- `get_owned_cafe()` — `{id, name}`。マイページ「自分の店舗」導線・S_POST_OFFICIAL のカフェ解決用
- `get_owned_cafe_for_edit(p_cafe_id)` — 編集フォームのフル列。S_OWNER_CAFE_EDIT のプリフィル用
- `get_owned_cafe_for_dashboard(p_cafe_id)` — `{id, name}`。S_OWNER_DASHBOARD の本人確認＋表示名用

`getCafeDetail`（S_CAFE_DETAIL）はまだ未対応（[pending-items D55](../../product/pending-items.md#d55-認証済みオーナーが自分のカフェを-closedhidden-にすると自分でも閲覧できなくなる)）。

---

## areas

エリアマスタ。制覇マップ・検索フィルタで使う。**ISO 3166-2 準拠のコード体系**（都道府県は `JP-13` 等）。詳細な初期セットは [seed/areas-initial-set.md](../../seed/areas-initial-set.md) 参照。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| code | text | PK | 例: `JP-13-shibuya-ku` |
| prefecture_code | text | NOT NULL | 例: `JP-13` (東京都) — ISO 3166-2 |
| slug | text | NOT NULL | 例: `shibuya-ku`（URL・タグ用） |
| label | text | NOT NULL | 例: `渋谷区` |
| label_kana | text | | 例: `シブヤク`（検索用） |
| level | text | NOT NULL | `ward`（市区町村レベル） / `sub_area`（副地域・人気エリア） |
| parent_code | text | FK → areas(code) | 上位エリア（例: `JP-13-shibuya-ku` 配下に `JP-13-omotesando`） |
| center_location | geography(POINT, 4326) | | 地図中心座標 |
| priority | smallint | NOT NULL, DEFAULT 0 | 表示優先度（副都心系を上位に） |
| is_active | boolean | NOT NULL, DEFAULT true | 論理削除相当 |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**制約:**
- `UNIQUE (prefecture_code, slug)` — 都道府県内でslug重複禁止
- `CHECK (code = prefecture_code || '-' || slug)` — コード整合性の自動チェック
- `CHECK (level IN ('ward','sub_area'))`
- `CHECK (parent_code IS DISTINCT FROM code)` — 自分自身を親にできない（階層ナビが無限ループする）
- `CHECK ((level='ward' AND parent_code IS NULL) OR level='sub_area')` — 階層は1段のみ。`ward` が親を持つと階層走査が循環し、23区制覇の母数もずれる
- `parent_code` の FK は `ON DELETE RESTRICT`（コード変更禁止・削除は `is_active=false` の運用に合わせる）

> **残る穴:** `sub_area` 同士が互いを親に指す2ノード循環は CHECK では防げない（CHECK は他行を参照できない）。
> 現状マスタを書けるのは seed と service_role だけなので実害はないが、
> **admin がエリアを編集できるようにする時（[pending-items A9](../../product/pending-items.md)）に、
> 「親は必ず `level='ward'`」をトリガーで担保すること。**

**`tiptap_to_plaintext` の戻り値は NULL になりうる。** `supabase gen types` は関数の戻り値を
non-nullable (`Returns: string`) として生成するため、RPC 経由で呼ぶ場合は型を信用せず NULL を扱う
（text ノードが無い投稿・STRICT による NULL 入力の2経路がある）。`posts.body_text` の生成列は
`coalesce` で包んでいるので DB 側は安全。

**`level` を持つ理由:** `parent_code IS NULL` を「市区町村レベル」の代わりに使うと、23区外で親を持たないエリア（例: 吉祥寺／武蔵野市）が混入して「東京23区制覇」の母数が狂う。レベルは明示的に持つ。

**インデックス:**
- `(prefecture_code, priority DESC)` — 都道府県別の表示順
- `(prefecture_code, level)` — 制覇マップの母数集計
- `(parent_code)` — 階層ナビゲーション
- `GIST(center_location)` — 地図検索

**RLS:**
- SELECT: 全ユーザー (`is_active = true`)
- INSERT / UPDATE / DELETE: admin のみ

`is_admin()` を使った書き込みポリシーは `20260905130400_master_tables_admin_write.sql` で追加済み。
`FOR ALL` なので admin だけは `is_active = false` のエリアも読める（ポリシーは OR 結合）。

**運用:**
- コード変更は禁止（外部参照が壊れる）— 変更が必要なら `is_active=false` にして新コードを作る
- 階層の親子関係は 1階層のみ想定（過度な深さは避ける）
- **境界ポリゴン列は持たない。** 位置情報は `center_location`（点）のみ。カフェのエリア判定は `ST_Distance` で最寄りの中心点を選ぶ（行政界ポリゴンの調達・保守コストに見合わない。[pending-items A3](../../product/pending-items.md)）
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

**制約:**
- `CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL))` — 定休日でないのに営業時間が両方未設定の状態を防ぐ。深夜営業（22:00始まり〜翌02:00終わり等）は `opens_at > closes_at` として許容し、日をまたぐ判定はアプリ側で行う

**`day_of_week` の基準:** 0=日曜〜6=土曜。カフェの現地時刻（JST）の暦日を指す。`opens_at`/`closes_at` が壁時計時刻（`time`型）である以上、その日を特定するのも常に JST。「今日の営業時間」を引く側は必ず JST で曜日を求めること（`cafe_congestion_reports` 側の曜日集計は UTC 基準の統計バケットであり別概念、揃えない）。

**RLS:** SELECT 全ユーザー / INSERT・UPDATE・DELETE は `cafes.verified_owner_id` 本人（`status='active'` 必須）または admin

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
- `(cafe_id, reported_at DESC)` — `get_cafe_congestion_current()` の recent/historical 両CTEが使う唯一のインデックス。生の行のSELECTは本人+adminのみなので「一覧表示用」ではなく集計関数専用（2026-09-06 RLS変更に伴い用途を訂正）
- 曜日・時間帯（dow/hour）専用の複合インデックスは意図的に持たない。実データ量でEXPLAINすると、dow/hourは3項ORに展開されヒープ側Filterで評価され、専用インデックスは読まれず書き込みコストだけ払う。投稿数が増えて `cafe_congestion_hourly_avg` (Materialized View) へ移行する際に集計クエリに合わせて設計し直す

**RLS（2026-09-06 修正）:** SELECT は「本人 + admin」のみ（`reports` と同じ方針）。生の行は `user_id`・`cafe_id`・`reported_at` が並び、突き合わせれば「誰が今どのカフェにいるか」が割れる位置情報に近い個人情報のため、全ユーザー公開にはしない。集計値は `get_cafe_congestion_current()` 経由で全ユーザーに公開する（関数は `security definer` でこの制限を回避）。INSERT は認証済み本人かつ `profiles.status='active'`。UPDATE・DELETE 不可。

**`get_cafe_weekday_congestion(p_cafe_id)`（2026-09-23 追加）:** `S_OWNER_ANALYTICS` の曜日別混雑度平均。`get_cafe_congestion_current()` と同じ理由で `security definer`。曜日は `reported_at` を `Asia/Tokyo` に変換して算出する（JST 0〜8時台の投稿が前日のUTC曜日に数えられてしまう罠を避けるため、`get_cafe_congestion_current()` のUTCバケット照合とは意図的に異なる）。集計値のみで生の行を含まないため anon/authenticated どちらも呼べる。

### 表示ロジック（決定 2026-09-03）

`S_CAFE_DETAIL` の混雑度セクションで、以下の3段階の表示切替を実装:

1. **直近30分以内のレポートあり** → 「今の混雑度」として直近平均を表示
2. **なければ** → 「同曜日同時間帯の過去4週間平均」を表示（同じ `get_cafe_congestion_current()` 内でフォールバック）
3. **データ全くなし** → 「情報なし / 最初の報告者になろう」

**時間帯別グラフ:**
- 1週間分の折れ線グラフを常時表示（曜日 × 時間帯マトリクス）
- MVP時点では都度計算（Postgres関数）
- 投稿数が増えたら `cafe_congestion_hourly_avg` (Materialized View) に切替

### Postgres関数（MVP実装案）

実装は `supabase/migrations/20260906140100_create_cafe_congestion_reports.sql` を単一の情報源とする（要点のみ記載）:

- `security definer`（SELECT ポリシーを「本人+admin」に絞ったため、invoker のままだと呼び出し元本人の投稿しか集計できない）
- ±1時間の時間帯窓は `extract(hour ...) between h-1 and h+1` ではなく、`now()` に `interval` を加減してから曜日・時間を取り直す方式にする（`between` 方式は UTC 0時/23時で日をまたぐラップができず、JST 09:00 前後＝開店直後の投稿ピーク帯でサンプルが半減する不具合があった）
- 第2引数 `p_now timestamptz default now()` で基準時刻を注入可能にする。実運用は省略して実時刻を使うが、統合テストはこれを固定値で渡すことで「テストがデータを作ってから RPC を呼ぶまでの間に本当に1時間ティックして境界のバケットが窓から外れる」フレークを構造的に排除する
- `sample_count` は `coalesce(recent.n, historical.n, 0)` にしない — `count(*)` は0件でも NULL ではなく0を返すため `historical.n` に絶対に落ちない。`source` と同じ条件分岐で明示的に選ぶ
- 戻り値の `level_avg` は `source='none'` のとき NULL になるが、`supabase gen types` は `RETURNS TABLE` の列を non-nullable に生成するため、呼び出し側で型を信用せず NULL を扱うこと

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
| contact_email | text | NOT NULL |
| applicant_note | text | |
| review_notes | text | |
| reviewed_by | uuid | FK → profiles(id) |
| created_at | timestamptz | NOT NULL, DEFAULT now() |
| reviewed_at | timestamptz | |

**制約:**
- `CHECK (status IN ('pending','approved','rejected','withdrawn'))`
- `CHECK (jsonb_array_length(document_urls) >= 2)` — 書類2点以上（[error-catalog](../error-catalog.md) `DOCUMENTS_INSUFFICIENT`）

**列の意味:**
- `contact_email` — 運営からの追加確認先。`profiles` のログイン用メールとは別に持つ（[S_OWNER_CLAIM](../../design/wireframes/owner.md#s_owner_claimオーナー認証申請)）
- `applicant_note` — 「屋号と本人氏名が異なる場合の説明」等の補足事項
- `document_urls` の要素は `{ type: string, path: string }` の jsonb オブジェクト（例: `{"type": "business_license", "path": "owner-documents/{user_id}/{verification_id}/{uuid}.pdf"}`）。`type` は `business_license` / `business_card_with_photo` / `corporate_registry` / `notification_of_business` / `other` のいずれか。単なるURL配列にしないのは、admin 側の審査画面（S_ADMIN_OWNER_REVIEW、後続PR）が書類種別ごとに表示を分けるため
- `status='rejected'` の履歴は `DELETE` せず残す。却下後の再申請に待機期間は設けない（ワイヤー [owner.md](../../design/wireframes/owner.md) の「再申請する」ボタンが正）。再申請は新しい行として INSERT され、`review_notes` は直近の却下理由として S_OWNER_CLAIM に表示する

**RLS:**
- SELECT: 本人 + admin
- INSERT: 認証済み（`user_id = auth.uid()`）
- UPDATE: admin（審査）、**または本人が `status = 'pending' → 'withdrawn'` に変更する場合のみ**（申請の取り下げ）
- DELETE: 不可（履歴保持）

**追加の制約（RLS/CHECKでは表現できないもの）:**
- 部分ユニークインデックス `cafe_owner_verifications_pending_unique on (cafe_id) where status = 'pending'` — 同一カフェへの同時複数申請を防ぐ（[reports_open_unique](../../../supabase/migrations/20260921000000_create_reports.sql) と同型）。一意制約違反（23505）は `VERIFICATION_ALREADY_PENDING` に変換する
- BEFORE INSERT トリガーで `cafes.verified_owner_id IS NOT NULL` を検査し、`CAFE_ALREADY_CLAIMED` として弾く（[guard_posts_official_owner](../../../supabase/migrations/20260907120000_create_posts.sql) と同型）。`cafe_owner_verifications` 単体の RLS/CHECK ではテーブルをまたぐ検証を表現できないため

**ストレージパスの例外:**
- `owner-documents/{user_id}/{verification_id}/{uuid}.{ext}` の `verification_id` は DB 行の存在を要求しない。クライアントで `crypto.randomUUID()` を生成してパス命名にのみ使う（[posts の予約行パターン](./README.md#オブジェクトパス規約)とは異なる。`document_urls` に `CHECK (jsonb_array_length(document_urls) >= 2)` があるため、空の予約行を先に INSERT できない）。認可は `storage.objects` RLS のパス第1セグメント（`user_id`）のみで担保し、書類を2点以上アップロードし終えてから `cafe_owner_verifications` に一括 INSERT する

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
- SELECT（オーナー追加分）: 対象カフェの `verified_owner_id = auth.uid()` は `revoked_at` を問わず全行閲覧可（S_OWNER_REGULARS の認定履歴タブが取消済みも表示するため。`is_cafe_owner()` 使用）
- INSERT: `awarded_by = auth.uid()` かつ 対象カフェの `verified_owner_id = auth.uid()`
- UPDATE: 認定オーナーかつ `is_active_user()`（`revoked_at` 設定で取消。停止中オーナーは書き込めない — cafe_business_hours と同じ方針）
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
| body_text | text | GENERATED | 本文の平文（`tiptap_to_plaintext(body_json)`）— 部分一致検索・抜粋表示用 |
| body_search | tsvector | GENERATED | 全文検索用（`simple` 設定） |
| status | text | NOT NULL, DEFAULT 'published' | published / archived / hidden ※下書きは別テーブル `drafts` |
| visibility | text | NOT NULL, DEFAULT 'public' | public / followers |
| like_count | int | NOT NULL, DEFAULT 0 | トリガーで維持 |
| comment_count | int | NOT NULL, DEFAULT 0 | 同上 |
| bookmark_count | int | NOT NULL, DEFAULT 0 | 同上 |
| is_official | boolean | NOT NULL, DEFAULT false | 経営者による公式投稿フラグ（幹C） |
| official_format | text | | オーナー限定フォーマット: `tip` / `today_special` / `closure` / `new_menu` / NULL |
| metadata | jsonb | NOT NULL, DEFAULT '{}' | 公式投稿のフォーマット別項目 + 社会的証明カウンタ等の追加余地（下記） |
| published_at | timestamptz | | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |
| deleted_at | timestamptz | | 論理削除 |

**制約:**
- `CHECK (status IN ('published','archived','hidden'))`
- `CHECK (post_type IN ('short','blog'))`
- `CHECK (visibility IN ('public','followers'))`
- `CHECK (official_format IS NULL OR official_format IN ('tip','today_special','closure','new_menu'))`
- `CHECK (is_official = false OR cafe_id IS NOT NULL)` — 公式投稿は必ずカフェに紐づく
- **「`is_official=true` は認証済みオーナーのみ」は CHECK 制約では表現できない**（CHECK にサブクエリは書けない）。RLS の INSERT/UPDATE ポリシーで担保する:
  ```sql
  CREATE POLICY posts_insert ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      is_official = false
      OR EXISTS (SELECT 1 FROM public.cafes c
                 WHERE c.id = posts.cafe_id AND c.verified_owner_id = auth.uid())
    )
  );
  ```
  service_role 経由の書き込みは RLS を迂回するため、同等のチェックを BEFORE INSERT トリガーにも置く

**インデックス:**
- `(author_id, created_at DESC)`
- `(cafe_id, created_at DESC) WHERE cafe_id IS NOT NULL`
- `GIN(body_search)` — 英数字トークンの語一致
- `GIN(body_text gin_trgm_ops)` — 日本語の部分一致（実質こちらが主）
- `(published_at DESC) WHERE status='published' AND deleted_at IS NULL` — タイムライン

**RLS:**
- SELECT: `status='published' AND deleted_at IS NULL` かつ、作者の `profiles.status='active'`（`is_profile_active()`、[pending-items D29](../../product/pending-items.md#d29-停止削除ブロック関係のプロフィールをすべて404にしている)）かつ、**`visibility` を満たし**、閲覧者がブロックされていない（**posts_select**）。加えて、作者本人は `status` を問わず自分の投稿を常に読める（**posts_select_own**、後述）
- INSERT: `auth.uid() = author_id` かつ profile.status='active'
- UPDATE: `auth.uid() = author_id`
- DELETE: `auth.uid() = author_id`（論理削除運用）

**`visibility` の SELECT ポリシー:**
`visibility='followers'` の投稿は、作者本人と作者のフォロワーだけが読める（未ログインからは常に不可視）。SEO 対象の ISR ページ（`/posts/[id]`）は anon キーで描画されるため、フォロワー限定投稿は自動的に静的生成の対象外になる。

```sql
CREATE POLICY posts_select ON public.posts FOR SELECT TO anon, authenticated
USING (
  status = 'published'
  AND deleted_at IS NULL
  AND is_profile_active(posts.author_id)
  AND (
    visibility = 'public'
    OR author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.follows f
               WHERE f.followee_id = posts.author_id AND f.follower_id = auth.uid())
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = posts.author_id AND b.blocked_id = auth.uid())
       OR (b.blocker_id = auth.uid() AND b.blocked_id = posts.author_id)
  )
);
```

`is_profile_active(p_user_id)` は停止・削除された投稿者の投稿をフィード・詳細から除外するための関数（`20261003130000_posts_select_requires_active_author.sql`）。`is_active_user()` は呼び出し元本人固定のため使えず、別関数として追加した（D29）。

**`posts_select_own`: 作者本人は `status` を問わず自分の投稿を読める**

PostgreSQL の RLS は UPDATE/DELETE の対象行を選ぶ際にも SELECT ポリシーの `USING` を適用する（対象行を特定するための暗黙の読み取りが必要なため）。`posts_select` は `status='published'` を必須にしているため、これ1本だけでは author_id が一致していても `status='hidden'`/`'archived'` の自分の投稿は UPDATE の対象として一切見つからず、対象0件のまま**エラーなしで**成功扱いになってしまう。

一般投稿の新規作成は `reservePost`（`status='hidden'` で空本文の予約行を insert）→ `createPost`（Postgres 関数 `finalize_post` の RPC 呼び出し。本文確定・`post_images`/`post_tags` の書き込み・`status='published'` への更新を1トランザクションで行う）という手順を踏む。`finalize_post` は冒頭で対象行を `SELECT ... FOR UPDATE` によりロックしてから処理するため、同じ postId への同時呼び出しは自動的に直列化され、失敗時は関数全体（＝1トランザクション）が自動でロールバックする（`supabase/migrations/20260911134931_finalize_post_rpc.sql`）。この方式に至る前は本文 UPDATE → insert → status UPDATE を別々の文で行い失敗時にアプリ側で手動ロールバックしていたが、その最後の UPDATE がこの節の理由（RLSがUPDATE対象行選定にもSELECTポリシーを適用する）で機能しなくなり、投稿が永久に非公開のままになる致命的なバグとして統合テストで発覚した（`tests/integration/posts-create-flow.test.ts`）ほか、二重送信で行き詰まる別のバグも見つかったため、手動ロールバック方式そのものを廃止してRPCに一本化した。`reservePost`/`createPost` の分離は composer での画像アップロード前提を満たすための予約行方式（[pending-items D17](../../product/pending-items.md#d17-createpost-の-imagepaths-は画像アップロード時点で投稿行が既に存在することを前提にしている解消済み)）。

`post_images`/`post_tags` は `is_post_author()`（SECURITY DEFINER で `posts` の RLS をバイパス）で同じ問題を回避済み。`posts` 本体にも同じ考え方の permissive policy を追加し、既存の `posts_select` とは OR で合成させる:

```sql
CREATE POLICY posts_select_own ON public.posts FOR SELECT TO authenticated
USING (author_id = auth.uid());
```

**`posts_select_own` は `status` だけでなく `deleted_at` も見ない。** `deleted_at IS NULL` を足すと、論理削除した自分の投稿を作者が二度と UPDATE/DELETE できなくなり同じクラスのバグを作り直してしまうため、あえて `author_id` 一致のみにしている。結果として RLS は「作者本人から見て削除済み・非公開の投稿を隠す安全網」ではなくなった。**一覧・タイムライン系のクエリは、`status='published' AND deleted_at IS NULL` を必ずアプリ層（WHERE句）で明示すること。** RLS 任せにすると、作者本人のフィードや投稿一覧に自分の hidden・archived・論理削除済みの投稿が混ざる。合わせて、`posts_published_idx`（`(published_at DESC) WHERE status='published' AND deleted_at IS NULL`）はこの明示フィルタと一致して初めてプランナに使われる — `author_id = auth.uid() OR (status='published' AND deleted_at IS NULL AND ...)` という RLS の OR 合成述語だけでは部分インデックスが使われない可能性がある。

`comments` / `likes` / `post_bookmarks` は親 `posts` が読めることを前提にする（親が不可視なら子も辿れない）。

**本文サイズ上限:** `body_json` から抽出した平文は 50,000 文字以内とする（アプリ層で投稿前に検証）。Tiptap JSON 全体のバイトサイズは 512KB を上限の目安とする（画像は Storage 保存のため base64 埋め込み禁止）。

### 全文検索の方式（決定 2026-09-05）

**`simple` 設定の tsvector + `pg_trgm` の2本立てにする。PGroonga は導入しない。**

素の PostgreSQL に `'japanese'` テキスト検索設定は存在せず、`to_tsvector('japanese', ...)` は実行時エラーになる。かといって PGroonga を入れると tsvector 方式をやめて専用索引に寄せる設計変更が要り、索引サイズも増える。**幹A は「気分タグ起点の発見」が主軸で全文検索は補助**（[positioning.md](../../product/positioning.md)）なので、MVP は確実に動く構成を取る。

| 用途 | 仕組み |
|---|---|
| 日本語の部分一致（実質の主役） | `body_text` に `gin_trgm_ops` の GIN 索引。`body_text ILIKE '%渋谷%'` が索引で効く |
| 英数字の語一致（店名・`Wi-Fi` 等） | `body_search`（`simple` 設定の tsvector）に GIN 索引 |

`simple` 設定は空白区切りでしかトークン化しないため、日本語の文は1つの巨大トークンになり tsvector 側はほぼ効かない。**日本語検索の精度は pg_trgm が担う**と理解して使う。

**将来の差し替え:** 検索精度が課題になったら、`body_text` に PGroonga 索引を張り替えるだけで移行できる（列の追加・データ移行は不要）。この差し替えやすさが本方式を選ぶ理由でもある。

**Tiptap JSON → 平文の抽出:**
`type == "text"` のリーフノードを再帰的に結合する。GENERATED カラムから呼ぶため IMMUTABLE 必須。

```sql
CREATE OR REPLACE FUNCTION public.tiptap_to_plaintext(doc jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = '' AS $$
  SELECT string_agg(leaf->>'text', ' ')
  FROM jsonb_path_query(doc, 'strict $.** ? (@.type == "text")') AS leaf
$$;
```

**jsonpath は `lax` ではなく `strict` を使う。** `lax` は配列を自動展開するため、`$.**` が同じリーフを
「配列経由」と「直接参照」の2回拾い、本文が丸ごと重複する（`A B C` → `A A B C B C`）。
`strict` なら文書順に1回ずつ、text ノードが無い文書・スカラー・配列ルートでも期待どおりに動く
（検証: `tests/integration/shared-functions.test.ts`）。

GENERATED カラムの定義:
```sql
body_text text GENERATED ALWAYS AS (
  coalesce(public.tiptap_to_plaintext(body_json), '')
) STORED,

body_search tsvector GENERATED ALWAYS AS (
  to_tsvector('simple',
    coalesce(public.tiptap_to_plaintext(body_json), '')
    || ' ' || coalesce(title, ''))
) STORED
```

**`body_search` で `body_text` を参照していない理由:** PostgreSQL の生成列は**他の生成列を参照できない**。そのため両方が `body_json` から独立に計算する（`tiptap_to_plaintext` を2回呼ぶ形になるが、STORED なので書き込み時の1回だけ）。

**`metadata` のスキーマ（公式投稿）:** `official_format` ごとに追加項目を持つ。専用カラムを増やさず jsonb に寄せ、Zod スキーマ（`lib/validators/posts.ts`）で境界検証する。

```json
// today_special: 今日のおすすめ
{ "v": 1, "menu_name": "季節限定マロンタルト", "price_yen": 580,
  "valid_until": "2026-09-15" }        // 「今日のみ」「〜今週末」「期限なし(null)」

// new_menu: 新メニュー
{ "v": 1, "menu_name": "秋の限定ブレンド", "price_yen": 620,
  "available_from": "2026-09-15" }

// closure: 臨時休業・営業時間変更
{ "v": 1, "closure_type": "closed" | "hours_changed",
  "starts_on": "2026-09-15", "ends_on": "2026-09-15", "reason": "私用のため" }

// tip: 豆知識 — 追加項目なし（title + body_json のみ）
```

**`official_format` ごとの `post_type` 割り当て（決定 2026-09-22）:** `tip`（豆知識）は Tiptap 長文本体を持つため `blog`。`today_special` / `new_menu` / `closure` は画像＋短文＋`metadata` 中心の構造化フォーマットなので `short` に寄せる（`lib/constants/posts.ts` の `officialFormatPostType`）。

- `price_yen` は表示専用。価格の比較・アンカリング表示はフェーズ2（[mvp-scope.md](../../product/mvp-scope.md)）
- `closure` の期間は `cafe_business_hours` を上書きしない。営業時間そのものへの反映は `cafe_special_hours` テーブルの導入後（[pending-items B5](../../product/pending-items.md)）

**下書きの取り扱い:** 未公開の投稿は `posts` ではなく [`drafts`](#drafts) テーブルに保存。公開時に `drafts` から `posts` へ移送し、`drafts` は削除する。

---

## post_images

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| post_id | uuid | NOT NULL, FK → posts(id) ON DELETE CASCADE |
| storage_path | text | NOT NULL, **UNIQUE** | Supabase Storage `post-images` のオブジェクトパス |
| display_order | smallint | NOT NULL, DEFAULT 0 |
| width | int | |
| height | int | |
| alt_text | text | |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**アプリ層の責務:** アップロード時にEXIFを剥がしてから Storage に PUT する（クライアント側で exifr 等で処理）。
署名付きURLで直PUTする構成上サーバーはバイト列を検証できず、クライアント処理は改造クライアント・実装バグで迂回され得るため、
`createPost` / `createOfficialPost` の `finalize_*` 呼び出し直前でアップロード済みの画像を読み直し GPS の有無をサーバー側でも
確認する（`lib/storage/post-image-verify.ts`、検出時は該当オブジェクトを削除して投稿自体を拒否）。
バケット構成は [README.md #ストレージ設計](./README.md#ストレージ設計) を参照
（[pending-items A10](../../product/pending-items.md#a10-exif除去がクライアント信頼に依存している-解消済2026-09-25)）

**`storage_path` の一意制約:** 同じ `postId` への二重送信（`createPost` の再送・ダブルタップ）は
`finalize_post`（RPC）の行ロックにより直列化されるため、通常この制約が実際に働くことはない。
それでも重複行を防ぐスキーマ側の整合性担保として残す（`20260911124750_add_post_images_storage_path_unique.sql`、
[pending-items D17](../../product/pending-items.md#d17-createpost-の-imagepaths-は画像アップロード時点で投稿行が既に存在することを前提にしている解消済み)）。

**RLS:** SELECT 全ユーザー / INSERT・DELETE は post の作者

---

## drafts

下書き自動保存用。ブログ形式投稿の離脱防止（損失回避）。

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| author_id | uuid | NOT NULL, FK → profiles(id) |
| client_draft_key | text | NOT NULL | 端末側で発行するキー |
| payload | jsonb | NOT NULL | 投稿途中データ（`v`, post_id, post_type, title, body_json, tag_ids, image_paths, cafe_id, visibility） |
| last_saved_at | timestamptz | NOT NULL, DEFAULT now() |
| expires_at | timestamptz | NOT NULL, DEFAULT now() + interval '30 days' |

**制約:** `UNIQUE (author_id, client_draft_key)`

**`payload` スキーマ（バージョン管理あり）:**

```json
{
  "v": 1,
  "post_id": "uuid",
  "post_type": "short | blog",
  "title": "string | null",
  "body_json": { "type": "doc", "content": [] },
  "tag_ids": ["uuid"],
  "image_paths": ["string"],
  "cafe_id": "uuid | null",
  "visibility": "public | followers"
}
```

`v` でスキーマバージョンを管理する。フォームのデータ構造変更時は `v` をインクリメントし、クライアント側でバージョン不一致の下書きは破棄して新規下書きとして扱う（サイレント破棄ではなく「古い下書きは使えません」のUI通知を推奨）。

**`post_id` が必須な理由:** composer は表示開始時に [`reservePost`](#posts) で `status='hidden'` の予約行を作り、画像アップロードの署名付きURL発行（`is_post_author`）と `finalize_post` の両方でその id を使う（[pending-items D17](../../product/pending-items.md#d17-createpost-の-imagepaths-は画像アップロード時点で投稿行が既に存在することを前提にしている解消済み)）。`payload` に持たせないと、下書き再開のたびに新しい予約行が生まれ、`image_paths`（`{author_id}/{post_id}/…` 規約）も再開後の postId と一致しなくなり finalize 時に FORBIDDEN になる。

**運用:** `expires_at < now()` を日次削除。`pg_cron` は Supabase Pro 以上のため、MVP（Free）では Edge Function + GitHub Actions の `schedule` で実行する（[pending-items A6](../../product/pending-items.md)）。取りこぼし対策として、下書き一覧の取得時にも `expires_at > now()` で絞る

**RLS:** SELECT・INSERT・UPDATE・DELETE すべて `auth.uid() = author_id`

---

## comments

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| post_id | uuid | NOT NULL, FK → posts(id) ON DELETE CASCADE |
| author_id | uuid | NOT NULL, FK → profiles(id) |
| parent_id | uuid | FK → comments(id) | 返信スレッド。**1階層まで**（返信への返信は不可、トリガーで強制） |
| body | text | NOT NULL |
| is_official | boolean | NOT NULL, DEFAULT false | オーナー公式返信フラグ（幹C） — UIで区別表示 |
| created_at | timestamptz | NOT NULL, DEFAULT now() |
| updated_at | timestamptz | NOT NULL, DEFAULT now() |
| deleted_at | timestamptz | |

**インデックス:** `(post_id, created_at)`

**本文サイズ上限:** 500 文字以内（アプリ層 Zod で検証。posts の50,000字は投稿本文向けで、コメントには長すぎるため別途定める）。

**返信の整合性:** `parent_id` は自己参照 FK のみでは「別の投稿のコメントへの返信」「返信への返信（2階層目）」を防げない。`before insert or update` トリガーで、`new.parent_id` が指す行の `post_id` が `new.post_id` と一致すること、かつその行自身が `parent_id is null`（＝トップレベルのコメントであること）を検証する。自己参照（`parent_id = id`）は CHECK 制約で弾く。
存在しない/削除済みの `parent_id` は `raise exception 'COMMENT_NOT_FOUND'` で区別できるメッセージにする（23503 の外部キー制約チェックより先にこの BEFORE トリガーが発火するため、FK 違反としては到達しない）。

**RLS:**
- SELECT: 2本の permissive policy の OR。
  1. `comments_select_visible`: `deleted_at IS NULL` かつ **投稿が見える場合のみ**（`exists (select 1 from posts p where p.id = comments.post_id) or is_post_author(post_id)` — サブクエリに呼び出し元ロールの `posts` RLS がそのまま適用されるため、hidden・論理削除済み・非公開投稿・作者ブロック済みのコメントは第三者から読めない。[post_images](#post_images) / [post_tags](#post_tags) と同じパターン）かつブロック相手（`author_id`）を除外
  2. `comments_select_own`: `author_id = auth.uid() or is_post_author(post_id)`（`deleted_at` を見ない）。[posts_select_own](#posts) と同じ理由 — PostgreSQL の RLS は UPDATE 対象行の選択だけでなく「更新後の新しい行が何らかの SELECT ポリシーを満たすか」も検証するため、`deleted_at` を立てる論理削除の UPDATE は当人であっても`comments_select_visible`単独では常に RLS 違反になる。この permissive policy が無いと投稿主も作者も自分のコメントを一切削除できない。
  **注意:** 2番目のポリシーにより「削除済みコメントは誰にも見えない」という保証は RLS だけでは成立しない（作者・投稿主には見え続ける）。一覧取得は必ずアプリ層で `deleted_at is null` を明示すること（`posts_select_own` と同じ運用）
- INSERT: 認証済み。`is_official = true` は該当カフェの `verified_owner_id = auth.uid()` の場合のみ許可（RLS の `WITH CHECK` に加えて、posts と同様に `security definer` トリガー `guard_comments_official_owner` も併置する。RLS の `WITH CHECK` は `auth.uid()` 前提のため service_role 経由の書き込みでは迂回できてしまうため）
- UPDATE: `auth.uid() = author_id or is_post_author(post_id)`。ただし `body` を変更できるのはコメント作者本人のみで、投稿主は `deleted_at`（論理削除）以外の列を変更できない — `guard_comments_moderation_columns` トリガーで列単位に強制する（[profiles の `guard_privileged_profile_columns`](#profiles) と同じ形）。
  さらに、**返信が付いたトップレベルコメントは、投稿主でない作者本人には削除させない**（`COMMENT_HAS_REPLIES` を raise）。他人が書いた返信を、コメントの作者というだけの権限で道連れに消せてしまうのを防ぐため。投稿主が削除する場合は制限を受けず、`cascade_delete_comment_replies` トリガーが未削除の返信を連動して論理削除し、`comment_count` も行単位のカウントトリガーで正しく減算される（そうしないと、返信だけが `comment_count` に残ったまま `getPostComments` の親フィルタ越しに永久に取得できなくなる）
- DELETE: 物理 DELETE は許可しない（`deleted_at` を立てる論理削除のみ。UPDATE ポリシーでカバー）

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

**インデックス:** `(category, priority DESC)` — 「今、どんなカフェ気分？」のカテゴリ別 priority 順表示

**制約:** `CHECK (category IN ('area','mood','occasion','other'))` / `CHECK (usage_count >= 0)`

**RLS:** SELECT 全ユーザー / INSERT・UPDATE admin のみ（`is_admin()`）

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
| user_id | uuid | PK, FK → profiles(id) ON DELETE CASCADE |
| post_id | uuid | PK, FK → posts(id) ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**インデックス:** `(post_id, created_at desc)` — 主キーは `post_id` が第2列なので
「この投稿へのいいね」を引けない

**自己いいね:** **許可**する（`follows_no_self_follow` とは判断が異なる）。禁止すると
「自分の投稿だけボタンを出さない」出し分けが全画面に増えるため。CHECK は置かない

**運用:** `sync_post_like_count()` トリガーで `posts.like_count` を維持する。
- **`security definer` が必須。** `posts_update_own` は `using (author_id = auth.uid())` なので、
  呼び出し元の権限のままだと「いいねした人＝投稿者」のときしか UPDATE が通らず、他人の投稿への
  いいねは0件更新になる。UPDATE が0件でもエラーにならないため、行は入りボタンも成功表示のまま
  カウントだけ増えないという形で壊れる（`delete_follows_on_block()` と同じ理由）
- 解除側は `greatest(like_count - 1, 0)` で負に振れないようにする
- **カウント更新では `posts.updated_at` を動かさない。** `posts_updated_at` トリガーに
  「3つのカウント列がいずれも変わっていないとき」という WHEN 句を足して抑止している。
  `updated_at` は「作者が本文を編集した時刻」として読めるべきで、他人の操作で動くと破綻する
- **返報性通知:** `likes` テーブル自体のトリガーではなく、`notify_on_like()`
  （`20260920150000_create_notifications.sql`）が別トリガーとして発火する。自己いいね・
  ブロック関係・`user_settings.notify_like=false` は通知を作らない（[notifications](#notifications)）

**RLS:** SELECT は**投稿の可視性を継承したうえで、ブロックしていない相手のぶんだけ**全ユーザー
（`using ((exists(select 1 from posts p where p.id = likes.post_id) or is_post_author(likes.post_id)) and not is_blocked_either_way(user_id))`）
/ INSERT・DELETE は本人。INSERT のみ `is_active_user()` を要求し、DELETE は停止中でも通す
（自分のいいねを外せない状態に閉じ込めない）。**UPDATE ポリシーは置かない**（＝拒否。
更新できる列が無く、付け外しは INSERT / DELETE で行う）。

SELECT を原則公開にするのは `user_cafe_lists`（本人のみ）とは逆の判断で、本人限定に締めると
他人のカードで `like_count` と実データの突き合わせができなくなるため。
ただしブロックだけは反映する（CLAUDE.md「通報・ブロックは即時RLSに反映」）— `using (true)` だと
ブロックされた側が `likes` を `user_id` で絞るだけで相手のいいねした投稿を列挙でき、
`posts_select` が隠しているはずの投稿の存在まで ID として漏れる。
未ログインでは `auth.uid()` が null になり全件見える。

**投稿の可視性継承（D38, `20260923150000_likes_select_visibility.sql`）:**
当初 SELECT は投稿側の状態を見ておらず、`post_id` さえ分かれば hidden・archived・論理削除済み・
非公開（`visibility='followers'` で非フォロワー）の投稿へのいいねも誰でも読めていた。
`comments_select_visible`（[comments](#comments)）と同じパターンで
`exists(select 1 from posts p where p.id = likes.post_id) or is_post_author(likes.post_id)` を
既存条件と AND 結合し、`posts_select` をそのまま継承させた。`is_post_author` は `author_id` 一致
のみを見て `deleted_at` を考慮しないため、投稿主本人は自分の論理削除済み投稿へのいいねも読める
（`comments_select_visible` の `is_post_author` OR と同じ制約）。

**`count_likes_given` RPC（同マイグレーション）:** 上の可視性継承により、`likes` への
plain SELECT はすべて `posts_select` 経由で暗黙にフィルタされるようになった。
`lib/badges/rules.ts` の `countLikesGiven`（呼び出しセッション＝いいねした本人で
`user_id` を絞るだけ）は、対象の投稿が後から非公開（フォロワー外）になった時点で
過小評価になる（`count_likes_received` で一度起きた問題と同型）。`security definer` で
`status='published' and deleted_at is null` のみを条件に集計する RPC に切り出して回避した。
`count_likes_received` と同様、`p_user_id` は任意に指定できるため「誰が誰に何件いいねを
送ったか」の集計値自体は認証済みユーザーなら誰でも引ける（既存の受け取り側と同じトレードオフ）。

**`badge_criteria_met` の `likes_given` 分岐も同時に揃える。** `award_badge`
（[user_badges](#user_badges)）の唯一の権威ある判定である `badge_criteria_met` は、
このマイグレーション以前は `likes_given` を無絞り込みの `count(*)` で判定しており、
`count_likes_given` を導入すると lib 側の事前フィルタ（`evaluateCriteria`）だけが
hidden/archived/削除済みぶんを除外し、`badge_criteria_met` はそれを含めて判定するという
食い違いが生まれる。`likes_received` 分岐が `count_likes_received` を使っているのと同じ形に
揃え、`badge_criteria_met` の `likes_given` 分岐も `count_likes_given` を呼ぶように変更した。

`follows_select_all` が `using (true)` のままなのは、フォロー数・フォロワー数が
ワイヤーで公開表示される設計だから（[wireframes/browsing.md](../../design/wireframes/browsing.md)
#S_USER_PROFILE_PUBLIC）。ブロック相手との行は `delete_follows_on_block` が消すので
関係そのものは残らない。ただし**「その人が他に誰をフォローしているか」は誰でも読めるまま**で、
露出の種類としては likes と同じ。揃えるかは
[pending-items D36](../../product/pending-items.md) で保留している

**`like_count` は閲覧者によって変えない。** 隠すのは「誰がいいねしたか」だけで、
カウントはトリガーが維持する集計値。閲覧者ごとに引き算すると、同じ投稿の件数が
ブロックの有無で食い違う

**読み取りの注意:** 「自分がいいね済みか」は別名埋め込み（`my_like:likes (user_id)` +
`.eq('my_like.user_id', viewerId)`）で1クエリにまとめる。**`!inner` を付けてはいけない**
（`user_cafe_lists` とは逆）。付けると「まだいいねしていない投稿」が一覧から丸ごと消え、
投稿詳細は404になる。未ログイン時は埋め込みフィルタ自体を付けない
（`lib/posts/post-list.ts` / `post-detail.ts`）

---

## user_cafe_lists

お気に入り + 行きたい を統合。将来の拡張余地あり。

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) ON DELETE CASCADE |
| cafe_id | uuid | PK, FK → cafes(id) ON DELETE CASCADE |
| list_type | text | PK, NOT NULL |
| note | text | ユーザーメモ |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**制約:** `CHECK (list_type IN ('favorite','want_to_go'))`

**インデックス:** `(user_id, list_type, created_at desc)` — 一覧（S_FAVORITES / S_WANT_TO_GO）の
「本人 + list_type を追加日の新しい順」。主キーは `list_type` が第3列なので並び替えに使えない

**RLS:** SELECT・INSERT・DELETE は本人のみ（admin にも開けない: 「どの店に行きたいか」は
行動履歴そのものなので `cafe_congestion_reports` と同じ扱いにする）。INSERT のみ
`is_active_user()` を要求し、DELETE は停止中でも通す（自分のリストから外せない状態に閉じ込めない）。
**UPDATE ポリシーは置かない**ため、`note` は INSERT 時しか値を入れられない（編集導線は
[pending-items D32](../../product/pending-items.md)）

**読み取りの注意:** 埋め込みは必ず `cafes!inner`。`cafes_select_active_*` が `status='active'` で
絞るため、外側の join だと閉店・非公開の店が「リスト行はあるのに cafes が null」で返る
（`lib/cafes/user-cafe-lists.ts`）

---

## post_bookmarks

| カラム | 型 | 制約 |
|---|---|---|
| user_id | uuid | PK, FK → profiles(id) ON DELETE CASCADE |
| post_id | uuid | PK, FK → posts(id) ON DELETE CASCADE |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**インデックス:** `(user_id, created_at desc)` — `/me/bookmarks`（S_BOOKMARKS）の
「本人の保存を新しい順」に対応する

**運用:** `sync_post_bookmark_count()` トリガーで `posts.bookmark_count` を維持する
（`likes` の `sync_post_like_count()` と同型・`security definer` 必須）。物理 DELETE のみで
論理削除は無い（`likes` と同じ）

**RLS: 本人のみ。** `likes` と異なり SELECT も本人限定にする（`likes_select_all` のような
公開ポリシーは無い）。「保存した投稿一覧」は他人に見せる画面が存在しないため

---

## reports

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| reporter_id | uuid | NOT NULL, FK → profiles(id) |
| target_type | text | NOT NULL | post / comment / user / cafe |
| target_id | uuid | NOT NULL |
| reason | text | NOT NULL | spam / harassment / minor_risk / copyright / privacy / other |
| description | text | |
| status | text | NOT NULL, DEFAULT 'pending' | pending / reviewing / resolved / rejected |
| reviewer_id | uuid | FK → profiles(id) |
| resolution_notes | text | |
| created_at | timestamptz | NOT NULL, DEFAULT now() |
| resolved_at | timestamptz | |

**制約:**
- `CHECK (reason IN ('spam','harassment','minor_risk','copyright','privacy','other'))`
- `CHECK (target_type IN ('post','comment','user','cafe'))`
- `CHECK (status IN ('pending','reviewing','resolved','rejected'))`
- **同一ユーザーによる同一対象への重複通報を DB で弾く**（[error-catalog](../error-catalog.md) `REPORT_ALREADY_SUBMITTED`）:
  ```sql
  -- 未処理の通報が既にある間だけ重複を禁止する（部分ユニークインデックス）
  CREATE UNIQUE INDEX reports_open_unique
  ON public.reports (reporter_id, target_type, target_id)
  WHERE status IN ('pending','reviewing');
  ```
  **全期間の UNIQUE にはしない。** 一度 `resolved` / `rejected` になった対象が後に再び違反状態になる（投稿が編集される等）ケースで、同じ人が二度と通報できなくなるため

**インデックス:** `(status, created_at)` — モデレーションキュー

**RLS:** SELECT 本人 + admin / INSERT 認証済み / UPDATE admin のみ

**理由コードと UI ラベルの対応**（[wireframes/composer.md S_REPORT_FORM](../../design/wireframes/composer.md#s_report_form通報フォーム)）:

| code | UIラベル |
|---|---|
| `spam` | スパム / 宣伝 |
| `harassment` | 嫌がらせ / 誹謗中傷 |
| `minor_risk` | 未成年に不適切 |
| `copyright` | 著作権侵害 |
| `privacy` | 個人情報を含む |
| `other` | その他 |

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

**運用:** `createPost` / `createComment` から `check_ng_words()`（security definer 関数、`ng_words` の
admin限定RLSをバイパスして参照する）で単語一致チェック。一致は大文字小文字を無視した部分一致。
`block` は保存拒否（`NG_WORD_DETECTED`）。`warn` は MVP では未実装（保存は妨げない） —
「運営レビューキューに送る」は `reports` テーブルの設計上すぐには実装できず見送り
（[pending-items D49](../../product/pending-items.md#d49-ng_words-severitywarn-の運営レビューキュー送りを見送り)）

**RLS:** SELECT admin のみ / INSERT・UPDATE・DELETE admin のみ。ただし `check_ng_words()` は
security definer で RLS をバイパスし、authenticated から実行可能

---

## notifications

| カラム | 型 | 制約 |
|---|---|---|
| id | uuid | PK, DEFAULT gen_random_uuid() |
| recipient_id | uuid | NOT NULL, FK → profiles(id) |
| actor_id | uuid | FK → profiles(id) |
| type | text | NOT NULL | 下の CHECK 制約と同じ値域（説明は下表） |
| entity_type | text | | post / comment / user 等 |
| entity_id | uuid | |
| payload | jsonb | NOT NULL, DEFAULT '{}' |
| read_at | timestamptz | |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**制約:** `CHECK (type IN ('like','comment','follow','mention','badge','owner_verified','owner_verification_rejected','regular_awarded','official_post','report_resolved'))`

| type | 発火元 | 宛先 |
|---|---|---|
| `like` | `likes` INSERT | 投稿者 |
| `comment` | `comments` INSERT | 投稿者 / 親コメント作者 |
| `follow` | `follows` INSERT | フォローされた人 |
| `mention` | 本文中の @メンション（MVP未実装、[pending-items D2](../../product/pending-items.md)） | 対象ユーザー |
| `badge` | `checkAndAwardBadges` | 獲得者 |
| `owner_verified` | オーナー認証の承認 | 申請者 |
| `owner_verification_rejected` | オーナー認証の却下（`review_notes` に理由） | 申請者 |
| `regular_awarded` | 常連認定（幹C） | 認定されたユーザー |
| `official_post` | オーナー限定投稿の公開（幹C） | 当該カフェを「お気に入り」「行きたい」に入れているユーザー |
| `report_resolved` | 通報の `status` が resolved / rejected に遷移 | 通報者 |

**インデックス:** `(recipient_id, created_at DESC) WHERE read_at IS NULL` — 未読

**ユーザー設定の反映:** `like` / `comment` / `follow` の3種は、発火元トリガーが **INSERT 前に [`user_settings`](#user_settings) の該当フラグを確認し、false なら行を作らない**。作ってから隠す方式にはしない（未読カウントがずれるため）。残りのタイプ（`badge` / `owner_verified` / `owner_verification_rejected` / `regular_awarded` / `official_post` / `report_resolved`）はユーザーが切れない重要通知として常に作る。

**RLS:** SELECT・UPDATE は recipient のみ / INSERT は admin のみ、かつ
`type IN ('report_resolved', 'owner_verified', 'owner_verification_rejected')`（S_ADMIN_REVIEW /
S_ADMIN_OWNER_REVIEW の Server Action から直接書き込むため。他の type は security definer トリガー
経由で RLS をバイパスするので INSERT ポリシー自体を必要としない）

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

**制約:** `CHECK (coalesce(jsonb_typeof(criteria->'type'),'') = 'string' AND coalesce(jsonb_typeof(criteria->'threshold'),'') = 'number')`
— **`coalesce` が要る。** `jsonb_typeof` は STRICT なのでキーが無いと NULL を返し、CHECK は NULL を「通過」と扱うため、
`coalesce` 無しだと `'{}'` や `type` だけの JSON が素通りする（検証: `tests/integration/master-tables-constraints.test.ts`）。
`type` の値そのものは列挙しない（フェーズ2でバッジ種別が増えるたびにマイグレーションを打つのは割に合わない）。
確定した9種の `type` は [seed/badges-initial-set.md](../../seed/badges-initial-set.md) 参照

**RLS:** SELECT 全ユーザー / INSERT admin のみ（`is_admin()`）

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
| area_code | text | PK, FK → [areas](#areas)(code) | エリアコード（例: `JP-13-shibuya-ku`） |
| first_visited_at | timestamptz | NOT NULL |
| last_visited_at | timestamptz | NOT NULL |
| visit_count | int | NOT NULL, DEFAULT 1 |

**運用:** 投稿が `published` になった時にトリガーで自エリア + 親エリアを upsert する。トリガー定義と NULL 対策は [README.md #エリアコードの一貫性](./README.md#エリアコードの一貫性) を参照

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

**RLS:** SELECT admin のみ / INSERT は admin 本人のみ（`actor_id = auth.uid()` を RLS で強制。
S_ADMIN_REVIEW の Server Action から security definer 関数を介さず直接書き込む方式を採用したため。
[pending-items D48](../../product/pending-items.md)）
