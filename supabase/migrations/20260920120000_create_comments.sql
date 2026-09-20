-- ============================================
-- comments: 投稿へのコメント（返信は1階層まで、オーナー公式返信対応）
--
-- posts.comment_count は 20260907120000 で default 0 のまま置かれており、
-- sync_post_comment_count トリガーが維持する（likes の sync_post_like_count と同型）。
--   docs/architecture/data-model/tables.md #comments
-- ============================================

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  parent_id    uuid references public.comments (id) on delete cascade,
  body         text not null,
  is_official  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  -- 自己参照の禁止。id の DEFAULT gen_random_uuid() は CHECK 評価より先に確定するため
  -- INSERT 時点で判定できる
  constraint comments_parent_not_self check (parent_id is distinct from id)
);

comment on table public.comments is
  '投稿へのコメント。返信は1階層まで（返信への返信は guard_comments_thread_integrity が拒否）。
   物理 DELETE は許可せず、deleted_at を立てる論理削除のみ。
   docs/architecture/data-model/tables.md #comments';
comment on column public.comments.body is
  '500文字以内（アプリ層 lib/validators/comments.ts の Zod で検証。DB 側に CHECK は置かない）';
comment on column public.comments.is_official is
  'オーナー公式返信フラグ（幹C）。true にできるのは post_id が指す投稿の cafe の
   verified_owner_id 本人のみ — guard_comments_official_owner トリガー（service_role 経由も
   含めて防ぐ）と comments_insert の RLS WITH CHECK の両方で担保する（posts.is_official と同じ形）';

create index comments_post_created_idx on public.comments (post_id, created_at);
create index comments_parent_idx on public.comments (parent_id) where parent_id is not null;

create trigger comments_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- ============================================
-- is_post_cafe_owner: 呼び出し元が指定投稿のカフェの verified_owner_id 本人か
--
-- is_cafe_owner(cafe_id) の post_id 版。comments には cafe_id 列が無く post_id しか
-- 持たないため posts 経由で cafe_id を引く。is_cafe_owner と同じ理由で security definer
-- にし、posts / cafes の SELECT RLS をバイパスして判定する
-- ============================================

create or replace function public.is_post_cafe_owner(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    join public.cafes c on c.id = p.cafe_id
    where p.id = p_post_id and c.verified_owner_id = (select auth.uid())
  );
$$;

comment on function public.is_post_cafe_owner(uuid) is
  '呼び出し元が指定投稿のカフェの verified_owner_id 本人か。is_cafe_owner の post_id 版。
   comments_insert の RLS WITH CHECK から使う';

revoke execute on function public.is_post_cafe_owner(uuid) from public;
grant execute on function public.is_post_cafe_owner(uuid) to authenticated;

-- ============================================
-- guard_comments_official_owner: is_official=true を service_role 経由でも防ぐ
--
-- RLS の WITH CHECK は auth.uid() を前提にするため service_role 経由の書き込み
-- （バッチ処理・管理操作）では迂回できてしまう。author_id と post_id の関係だけで
-- 判定するトリガーを併置する（posts.guard_posts_official_owner と同じ理由・同じ形）。
--
-- is_official は INSERT 後に変更不可（guard_comments_moderation_columns が UPDATE を
-- 拒否する）ため before insert のみで足りる
-- ============================================

create or replace function public.guard_comments_official_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_official and not exists (
    select 1 from public.posts p
    join public.cafes c on c.id = p.cafe_id
    where p.id = new.post_id and c.verified_owner_id = new.author_id
  ) then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger comments_guard_official_owner
  before insert on public.comments
  for each row execute function public.guard_comments_official_owner();

-- ============================================
-- guard_comments_thread_integrity: 返信は「同じ投稿」かつ「1階層まで」
--
-- parent_id → comments(id) の自己参照 FK だけでは、別の投稿のコメントへの返信や
-- 返信への返信（2階層目）を防げない。親コメントの post_id が一致し、かつ親自身が
-- トップレベル（parent_id is null）であることを検証する。
--
-- security definer にする理由: invoker のままだと親コメントの読み取りが
-- comments_select_visible（ブロック関係・投稿可視性を継承）越しになり、
-- ブロック相手のスレッドへの返信可否がねじれる。判定はスレッド構造の整合性だけを
-- 見るものなので、可視性を経由せず直接読む
-- ============================================

create or replace function public.guard_comments_thread_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_post_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select post_id, parent_id into parent_post_id, parent_parent_id
  from public.comments
  where id = new.parent_id;

  if parent_post_id is null then
    raise exception 'FORBIDDEN';
  end if;

  if parent_post_id is distinct from new.post_id then
    raise exception 'FORBIDDEN';
  end if;

  if parent_parent_id is not null then
    raise exception 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create trigger comments_guard_thread_integrity
  before insert or update of parent_id, post_id on public.comments
  for each row execute function public.guard_comments_thread_integrity();

-- ============================================
-- guard_comments_moderation_columns: 作者と投稿主で書ける列を分ける
--
-- comments_update の RLS は「作者 or 投稿主」の両方を通す（投稿主によるスパム
-- コメントの論理削除を許可するため）。そのままだと投稿主が他人のコメント本文
-- （body）まで書き換えられてしまうので、列単位でトリガーが強制する:
--   - post_id / author_id / parent_id / is_official / created_at は INSERT 後不変
--   - body を変更できるのは作者本人のみ
--   - 投稿主（作者以外）が変更できるのは deleted_at のみ
-- profiles.guard_privileged_profile_columns と同じ形
-- ============================================

create or replace function public.guard_comments_moderation_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() が無いのは service_role か直接接続（seed・運用スクリプト）
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.post_id is distinct from old.post_id
     or new.author_id is distinct from old.author_id
     or new.parent_id is distinct from old.parent_id
     or new.is_official is distinct from old.is_official
     or new.created_at is distinct from old.created_at then
    raise exception 'FORBIDDEN';
  end if;

  if new.body is distinct from old.body
     and (select auth.uid()) is distinct from old.author_id then
    raise exception 'FORBIDDEN';
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and (select auth.uid()) is distinct from old.author_id
     and not public.is_post_author(old.post_id) then
    raise exception 'FORBIDDEN';
  end if;

  return new;
end;
$$;

create trigger comments_guard_moderation_columns
  before update on public.comments
  for each row execute function public.guard_comments_moderation_columns();

-- ============================================
-- posts.comment_count の維持
--
-- security definer が必須（likes.sync_post_like_count と同じ理由）。posts_update_own
-- は author_id 本人のみ許可のため、他人の投稿へのコメントはカウントが0件更新になる。
--
-- INSERT で +1、論理削除（deleted_at が null → 非null）で -1。likes と違い物理 DELETE
-- が無いため after delete は不要
-- ============================================

create or replace function public.sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  end if;

  update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
  return new;
end;
$$;

comment on function public.sync_post_comment_count() is
  'comments の増減を posts.comment_count に反映する。posts_update_own（作者のみ）を
   バイパスする必要があるため security definer';

create trigger comments_sync_comment_count_insert
  after insert on public.comments
  for each row execute function public.sync_post_comment_count();

create trigger comments_sync_comment_count_soft_delete
  after update of deleted_at on public.comments
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.sync_post_comment_count();

-- ============================================
-- RLS
-- ============================================

alter table public.comments enable row level security;

-- posts 側の可視性（status/visibility/ブロック）をそのまま継承する。EXISTS のサブクエリは
-- 呼び出し元のロールで実行されるため posts_select の RLS がそのまま効く
-- （post_images_select_visible / post_tags_select_visible と同じパターン）。
-- is_post_author の OR で、作者本人には自分の archived/hidden な投稿のコメントも見せる。
-- ブロック関係は comments.author_id（コメントの書き手）を見る — likes と違い、
-- ここでの露出対象は「誰が何を書いたか」の本文なので、投稿可視性とは独立にブロックも効かせる
create policy comments_select_visible
  on public.comments for select
  to anon, authenticated
  using (
    deleted_at is null
    and (
      exists (select 1 from public.posts p where p.id = comments.post_id)
      or public.is_post_author(comments.post_id)
    )
    and not public.is_blocked_either_way(comments.author_id)
  );

-- CLAUDE.md「未成年アカウントは追加のガード」。suspended / pending_consent は投稿不可
create policy comments_insert_own
  on public.comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.is_active_user())
    and (
      exists (select 1 from public.posts p where p.id = post_id)
      or public.is_post_author(post_id)
    )
    and (not is_official or public.is_post_cafe_owner(post_id))
  );

-- 作者本人の編集 or 投稿主のモデレーション（論理削除）。列単位の制限は
-- guard_comments_moderation_columns トリガーが担う
create policy comments_update_moderation
  on public.comments for update
  to authenticated
  using (author_id = (select auth.uid()) or public.is_post_author(post_id))
  with check (author_id = (select auth.uid()) or public.is_post_author(post_id));

-- comments_select_own: 作者本人・投稿主は deleted_at を問わず自分に関係するコメントを読める
--
-- 統合テストで判明（20260910120000_fix_posts_select_own.sql の posts と同じ問題）:
-- PostgreSQL の RLS は UPDATE の対象行を選ぶ USING だけでなく、更新後の新しい行が
-- 「何らかの SELECT ポリシーの USING を満たすか」も検証する。comments_select_visible は
-- deleted_at IS NULL を必須にしているため、論理削除の UPDATE（deleted_at を null → 非null に
-- する）は自分自身の行であっても「更新後の行が見えなくなる」ため毎回 RLS 違反で弾かれてしまう。
-- author_id / is_post_author だけを見る（deleted_at を見ない）permissive policy を追加し、
-- comments_select_visible と OR で合成させることで、論理削除後も「自分のコメント」「自分の
-- 投稿へのコメント」として見え続けるようにする
create policy comments_select_own
  on public.comments for select
  to authenticated
  using (author_id = (select auth.uid()) or public.is_post_author(post_id));

-- DELETE ポリシーは置かない（物理 DELETE を禁止。削除は UPDATE の論理削除のみ）
