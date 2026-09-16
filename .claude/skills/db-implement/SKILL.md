---
name: db-implement
description: DBスキーマ・マイグレーション・RLSポリシー実装。テーブル追加、列変更、インデックス、Postgres関数、seedデータを扱う。
---

# /db-implement — DB実装

## 起動時に必ずやること

1. **設計ドキュメント確認:**
   - [docs/architecture/data-model/README.md](../../../docs/architecture/data-model/README.md) — 全体方針・RLS原則
   - [docs/architecture/data-model/tables.md](../../../docs/architecture/data-model/tables.md) — 対象テーブルの列・制約
2. **既存マイグレーション確認:** `supabase/migrations/` を Grep で見て命名規則・パターンを踏襲
3. **必要な拡張の確認:** `citext`, `pgcrypto`, `PostGIS`, `pg_trgm` などが有効化されているか
4. **`/test` を先に呼ぶ** — 統合テストでRLS検証を書く

## マイグレーションファイルの命名

```
supabase/migrations/
├── 20260902120000_init_schema.sql
├── 20260902130000_create_profiles.sql
├── 20260902140000_create_posts.sql
├── 20260903100000_add_area_code_to_cafes.sql
```

- タイムスタンプ 14桁 (`YYYYMMDDHHMMSS`) 接頭辞。**日付と時刻の間にアンダースコアを入れない**
  - Supabase CLI は `^([0-9]+)_(.*)\.sql$` でバージョンを切り出す。`20260902_120000_x.sql` と書くと
    バージョンが `20260902` になり、同じ日の2本目以降が**同一バージョンとして衝突する**
  - `supabase migration new <name>` が正しい形式で作ってくれるので、原則こちらを使う
- スネークケースで内容を表現
- 1マイグレーション = 1論理変更（複数目的を混ぜない）

## マイグレーションの構造

```sql
-- supabase/migrations/20260902_130000_create_profiles.sql

-- ============================================
-- profiles: ユーザープロフィール（auth.usersと1:1）
-- ============================================

create extension if not exists citext;

create type profile_role as enum ('user', 'owner', 'admin');
create type profile_status as enum ('active', 'pending_consent', 'suspended', 'deleted');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  display_name text not null,
  bio text,
  avatar_url text,
  birth_date date not null,
  status profile_status not null default 'active',
  guardian_email text,
  guardian_consent_at timestamptz,
  role profile_role not null default 'user',
  home_area text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_birth_date_check check (birth_date <= current_date - interval '13 years')
);

create index profiles_username_idx on public.profiles (username);
create index profiles_role_idx on public.profiles (role) where role in ('owner', 'admin');

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================
-- RLS
-- ============================================

alter table public.profiles enable row level security;

create policy profiles_select_all
  on public.profiles for select
  using (true);

create policy profiles_insert_self
  on public.profiles for insert
  with check (auth.uid() = id);

create policy profiles_update_self
  on public.profiles for update
  using (auth.uid() = id);
```

## 設計原則

### 1. すべてのテーブルで RLS を有効化

```sql
alter table public.{table} enable row level security;
```

RLS 未設定のテーブルは Supabase の警告対象。例外なし。

### 2. FK には `on delete` 挙動を明示

```sql
author_id uuid not null references public.profiles(id) on delete cascade
```

- `cascade`: 親削除で子も消える（投稿→画像・タグ・いいね等）
- `restrict`: 親削除を禁止（デフォルト、参照整合性）
- `set null`: 親削除で NULL 化（削除されたユーザーのコメントを残す等）

### 3. `updated_at` のトリガー

再利用可能な関数を1度定義:

```sql
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

各テーブルで:

```sql
create trigger {table}_updated_at
  before update on public.{table}
  for each row execute function public.set_updated_at();
```

### 4. カウンタのデノーマライズ

例: `posts.like_count`

```sql
create or replace function public.posts_like_count_change()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif (tg_op = 'DELETE') then
    update public.posts set like_count = like_count - 1 where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger likes_change
  after insert or delete on public.likes
  for each row execute function public.posts_like_count_change();
```

### 5. Enum vs Check 制約

- **少ない・変更少ない値** → PostgreSQL enum（型安全）
- **変更頻度高い or 動的** → text + CHECK 制約
- 迷ったら CHECK 制約（後で ALTER しやすい）

### 6. jsonb の設計

- `metadata jsonb not null default '{}'` を拡張用に配置
- 頻繁にクエリする値は列に昇格（jsonb は検索が遅い）
- GIN インデックスは必要になってから

## RLS ポリシーの落とし穴

### 1. ポリシーは `OR` 結合

複数の SELECT ポリシーは OR 評価される。片方が広ければ他は無効化。

### 2. `auth.uid()` のパフォーマンス

各行で `auth.uid()` を呼ぶとコスト増。頻繁にアクセスするテーブルは `(select auth.uid())` でサブクエリ化（PostgreSQL が定数として扱う）。

### 3. RLS + JOIN の権限

JOIN先テーブルにもRLSが適用される。SELECT結果が「見えないはずの行」を含まないか、統合テストで必ず確認。

### 4. Service Role Client は RLS を無視

管理用スクリプト以外で使わない。

## Postgres 関数（RPC）

複雑なクエリは関数化してクライアントから呼ぶ。

```sql
create or replace function public.get_home_timeline(
  p_user_id uuid,
  p_limit int default 20,
  p_offset int default 0
)
returns setof public.posts
language sql stable
security invoker  -- 呼び出しユーザーの権限で実行（RLS適用）
as $$
  select p.*
  from public.posts p
  join public.follows f on f.followee_id = p.author_id
  where f.follower_id = p_user_id
    and p.status = 'published'
    and p.deleted_at is null
  order by p.published_at desc
  limit p_limit offset p_offset;
$$;
```

**注意:**
- `security invoker` を明示（`definer` は使わない、RLSバイパスの元）
- `stable` or `immutable` で最適化ヒント

## seed データ

**マスタデータ（本番にも要るもの）はマイグレーションに置く。`supabase/seed.sql` には置かない。**

`seed.sql` は `supabase db reset`（ローカル）でしか実行されず、本番の経路である `supabase db push` は
流さない。`--include-seed` を付けても未適用マイグレーションが0件なら seed はスキップされる。
`seed.sql` に置いてよいのは「ローカル / Preview だけで欲しいもの」（開発用 admin、ダミー投稿など）。

マスタは `insert ... on conflict do update` の冪等なマイグレーションとして書き、
**変更時は既存ファイルを編集せず新しいマイグレーションを追加する**（forward-only）。

```sql
-- 厳選タグ
insert into public.tags (slug, label, category, is_curated) values
  ('morning-cafe', '朝カフェ', 'occasion', true),
  ('solo-time', '一人時間', 'occasion', true)
on conflict (slug) do nothing;

-- バッジ
insert into public.badges (code, name, description, criteria) values
  ('POST_FIRST', 'はじめての一杯', '初投稿を達成', '{"type":"post_count","threshold":1}'::jsonb)
on conflict (code) do nothing;
```

## テスト方針

### 統合テスト（RLS 検証）

- 各テーブルで **見える/見えない** の境界を必ずテスト
- ブロック関係が反映されるか
- 未成年（`status='pending_consent'`）から書き込みが弾かれるか

### マイグレーションテスト

- `pnpm db:reset` を CI で実行し、初期化 → seed が通ることを確認
- ロールバック（DOWN マイグレーション）は Supabase CLI が自動生成できないため、必要なら手動作成

## 破壊的変更の運用

**MVPフェーズは以下の順序:**

1. 新しい列を追加（nullable）
2. アプリ側で新旧両方を書き込む
3. データ移行スクリプト実行
4. 古い列を deprecated マーク
5. 別リリースで古い列を DROP

### DROP 時の注意

- FK 制約、View、関数の依存関係を確認
- Postgres の依存グラフ: `pg_depend`

## ローカル開発コマンド

```bash
pnpm db:start          # supabase start（Docker起動）
pnpm db:migrate:new    # supabase migration new
pnpm db:migrate        # supabase db push
pnpm db:reset          # supabase db reset + seed
pnpm db:types          # supabase gen types typescript --local > types/database.ts
pnpm db:diff           # ローカルと本番の差分確認
```

## 実装後のセルフレビュー

- [ ] RLS を全ポリシー含めて有効化した
- [ ] FK の delete 挙動を明示した
- [ ] CHECK 制約で不正データを排除した
- [ ] インデックスを追加した（大きなテーブルは必須）
- [ ] `updated_at` トリガーを設定した
- [ ] `pnpm db:reset` が通る
- [ ] `pnpm db:types` を実行して型を再生成した
- [ ] 統合テストで RLS の境界を確認した
- [ ] `/self-review` を実行
- [ ] `/board-update` で実装状況ボードを更新

## やらないこと

- **本番DBの直接編集** — 必ずマイグレーション経由
- **`security definer` の乱用** — RLSバイパスの元
- **ネストが深い CTE の乱発** — 可読性優先
- **カラム名の日本語化** — スネークケース英語で統一
