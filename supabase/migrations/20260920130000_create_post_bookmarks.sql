-- ============================================
-- post_bookmarks: 投稿の保存
--
-- posts.bookmark_count は 20260907120000 で default 0 のまま置かれており、
-- sync_post_bookmark_count トリガーが維持する（likes の sync_post_like_count と同型）。
-- posts_updated_at の when 句は 20260919120000（likes）で bookmark_count も
-- 対象に含めて張り替え済みなので、ここでは触らない。
--   docs/architecture/data-model/tables.md #post_bookmarks
-- ============================================

create table public.post_bookmarks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint post_bookmarks_pkey primary key (user_id, post_id)
);

comment on table public.post_bookmarks is
  '投稿の保存（お気に入り保存。likes とは別軸）。「保存した投稿一覧」は本人にしか
   見せない画面なので、likes と異なり SELECT も本人限定にする。
   posts.bookmark_count は sync_post_bookmark_count トリガーが維持する。
   docs/architecture/data-model/tables.md #post_bookmarks';

-- 主キーは (user_id, post_id)。/me/bookmarks（S_BOOKMARKS）は
-- user_id 一致・created_at 新しい順で引くのでこちらの並びに合わせる
create index post_bookmarks_user_created_idx on public.post_bookmarks (user_id, created_at desc);

-- ============================================
-- posts.bookmark_count の維持（sync_post_like_count と同じ理由・同じ形）
-- ============================================

create or replace function public.sync_post_bookmark_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set bookmark_count = bookmark_count + 1 where id = new.post_id;
    return new;
  end if;

  -- posts ごと削除された場合は行が既に無く 0件更新になる（cascade 削除の経路）
  update public.posts set bookmark_count = greatest(bookmark_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

comment on function public.sync_post_bookmark_count() is
  'post_bookmarks の増減を posts.bookmark_count に反映する。posts_update_own（作者のみ）を
   バイパスする必要があるため security definer';

create trigger post_bookmarks_sync_bookmark_count
  after insert or delete on public.post_bookmarks
  for each row execute function public.sync_post_bookmark_count();

-- ============================================
-- RLS
--
-- 「保存した投稿一覧」は本人にしか見せない画面（likes の「いいねした人」一覧が
-- 無いのとは違い、こちらは一覧そのものが存在しない）。likes_select_all のように
-- 公開はせず、user_cafe_lists と同じ「本人のみ」にする。
--
-- UPDATE ポリシーは置かない（＝拒否）。付け外しは INSERT / DELETE で行う
-- （user_cafe_lists / likes と同じ）。
-- ============================================

alter table public.post_bookmarks enable row level security;

create policy post_bookmarks_select_own
  on public.post_bookmarks for select
  to authenticated
  using (user_id = (select auth.uid()));

-- CLAUDE.md「未成年アカウントは追加のガード」。suspended / pending_consent は
-- 保存できない（likes_insert_own / user_cafe_lists_insert_own と同じ）
create policy post_bookmarks_insert_own
  on public.post_bookmarks for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- 解除は停止中でも通す。自分の保存を外せない状態に閉じ込めない（likes_delete_own と同じ）
create policy post_bookmarks_delete_own
  on public.post_bookmarks for delete
  to authenticated
  using (user_id = (select auth.uid()));
