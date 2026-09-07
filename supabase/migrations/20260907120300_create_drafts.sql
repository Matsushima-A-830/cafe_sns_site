-- ============================================
-- drafts: 下書き自動保存（ブログ形式投稿の離脱防止・損失回避）
--
-- 公開時に drafts から posts へ移送し、drafts 側は削除する（アプリ層）。
-- 期限切れ（30日）の日次削除は Edge Function + GitHub Actions で実行する
-- 予定（今回のスコープ外。docs/product/pending-items.md A6）。
--   docs/architecture/data-model/tables.md #drafts
--   docs/architecture/data-model/README.md #下書き自動保存の設計
-- ============================================

create table public.drafts (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references public.profiles (id) on delete cascade,
  client_draft_key  text not null,
  payload           jsonb not null,
  last_saved_at     timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '30 days',

  constraint drafts_author_client_key_unique unique (author_id, client_draft_key)
);

comment on column public.drafts.payload is
  '{ v, post_type, title, body_json, tag_ids, image_paths, cafe_id }。
   v でスキーマバージョンを管理し、フォーム変更時はクライアント側で
   バージョン不一致の下書きを破棄する（docs/architecture/data-model/tables.md #drafts）';

-- 取りこぼし対策で一覧取得時に expires_at > now() を都度絞る運用のため、
-- 期限切れ行の絞り込みに使う
create index drafts_author_expires_idx on public.drafts (author_id, expires_at);

-- ============================================
-- 15秒デバウンスの自動保存で毎回叩かれる last_saved_at / expires_at の更新
--
-- 両方とも default は行作成時の1回しか値を持たない。UPDATE のたびに
-- payload だけ upsert すると、毎日編集し続けている下書きでも初回作成から
-- 30日で expires_at を迎えて消えてしまう。UPDATE 時は常に「今保存した」
-- 「あと30日」に揃える（クライアントからの明示指定は無視する）
-- ============================================

create or replace function public.refresh_drafts_saved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.last_saved_at = now();
  new.expires_at = now() + interval '30 days';
  return new;
end;
$$;

create trigger drafts_refresh_saved_at
  before update on public.drafts
  for each row execute function public.refresh_drafts_saved_at();

-- ============================================
-- RLS
-- ============================================

alter table public.drafts enable row level security;

create policy drafts_select_own
  on public.drafts for select
  to authenticated
  using (author_id = (select auth.uid()));

-- CLAUDE.md「未成年アカウントは追加のガード」を posts/post_images/post_tags と
-- 同様に適用する。suspended/pending_consent は新規下書きの作成・更新もできない
create policy drafts_insert_own
  on public.drafts for insert
  to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_active_user()));

create policy drafts_update_own
  on public.drafts for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and (select public.is_active_user()));

create policy drafts_delete_own
  on public.drafts for delete
  to authenticated
  using (author_id = (select auth.uid()));
