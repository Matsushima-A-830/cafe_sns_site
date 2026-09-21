-- ============================================
-- ng_words: NGワード辞書（S_ADMIN_NG_WORDS で運営が管理）
--
-- createPost / createComment から check_ng_words() 経由で参照する。
-- severity='block' のみ今回のスコープで判定する（'warn' は保存を妨げない。
-- 「運営レビューキューに送る」は reports の設計上すぐには実装できず見送り。
-- docs/product/pending-items.md D49）
--   docs/architecture/data-model/tables.md #ng_words
-- ============================================

create table public.ng_words (
  id         uuid primary key default gen_random_uuid(),
  -- check_ng_words() は大文字小文字を無視して一致判定するため、UNIQUE制約も
  -- 同じ基準に揃える（profiles.username と同じ理由で citext を使う）
  word       extensions.citext not null unique,
  severity   text not null default 'warn',
  category   text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),

  constraint ng_words_severity_check check (severity in ('warn', 'block')),
  constraint ng_words_category_check
    check (category is null or category in ('harassment', 'adult', 'spam', 'other'))
);

comment on table public.ng_words is
  '投稿・コメント作成時の自動検出用NGワード辞書。運営（admin）のみが読み書きできる';

-- ============================================
-- RLS
--
-- admin 限定。posts/comments の作成は投稿者本人のセッションで動くため、
-- 自動検出はこの RLS を素通しでは参照できない → check_ng_words() で迂回する
-- ============================================

alter table public.ng_words enable row level security;

create policy ng_words_select_admin
  on public.ng_words for select
  to authenticated
  using (public.is_admin());

create policy ng_words_insert_admin
  on public.ng_words for insert
  to authenticated
  with check (public.is_admin());

create policy ng_words_update_admin
  on public.ng_words for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy ng_words_delete_admin
  on public.ng_words for delete
  to authenticated
  using (public.is_admin());

-- ============================================
-- check_ng_words: block該当ワードの検出
--
-- ng_words の SELECT RLS は admin 限定だが、呼び出し元（createPost/createComment）は
-- 投稿者本人のセッションで動く。is_blocked_either_way() / is_cafe_owner() と同じ理由で
-- security definer にして ng_words の RLS をバイパスする。
-- 一致方式は単純な部分一致（大文字小文字を無視）。LIKE の特殊文字（%, _）を word に
-- そのまま使うとエスケープ漏れの穴になるため position() を使う
--   docs/architecture/data-model/tables.md #ng_words
-- ============================================

create or replace function public.check_ng_words(p_text text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select word from public.ng_words
  where severity = 'block'
    and position(lower(word) in lower(p_text)) > 0
  limit 1;
$$;

comment on function public.check_ng_words(text) is
  '入力文中に一致する block ワードがあれば最初の1件を返す（無ければ NULL）。
   ng_words の admin限定RLSをバイパスするため security definer';

-- Supabase はプラットフォーム既定で新規関数に anon/authenticated/service_role へ直接
-- EXECUTE を付与する（`revoke ... from public` は PUBLIC 疑似ロールにしか効かず、
-- 直接付与されたロール権限は残る。cafes.sql の is_admin() コメント参照）。
-- 投稿・コメント作成は認証必須で anon 経路からは呼ばれないが、直接 revoke しておく
revoke execute on function public.check_ng_words(text) from public, anon;
grant execute on function public.check_ng_words(text) to authenticated;
