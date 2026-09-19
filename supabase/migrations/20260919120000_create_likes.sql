-- ============================================
-- likes: 投稿へのいいね
--
-- posts.like_count は 20260907120000 で default 0 のまま置かれており、
-- これを維持する仕組みが初めてここで入る。comments / post_bookmarks も
-- 同じ形（2列PK + カウント維持トリガー）になるので、その原型として書く。
--   docs/architecture/data-model/tables.md #likes
-- ============================================

create table public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint likes_pkey primary key (user_id, post_id)
);

-- 自己いいねは許さない理由が無いので許可する（follows の follows_no_self_follow とは
-- 判断が異なる）。禁止すると「自分の投稿だけボタンを出さない」出し分けが全画面に増える
comment on table public.likes is
  '投稿へのいいね。自己いいねは許可（CHECK を置かない）。posts.like_count は
   sync_post_like_count トリガーが維持する。docs/architecture/data-model/tables.md #likes';

-- 主キーは (user_id, post_id) なので post_id 単独の絞り込みに使えない。
-- 「この投稿に誰がいいねしたか」と service role でのカウント突き合わせに要る
create index likes_post_created_idx on public.likes (post_id, created_at desc);

-- ============================================
-- posts.like_count の維持
--
-- security definer が必須。posts_update_own は using (author_id = auth.uid()) なので、
-- 呼び出し元の権限のままだと「いいねした人＝投稿者」のときしか UPDATE が通らず、
-- 他人の投稿へのいいねは 0件更新になる。UPDATE が0件でもエラーにならないため、
-- likes の行は入りボタンも成功表示のまま、カウントだけ増えないという形で壊れる。
--   supabase/migrations/20260916120100_delete_follows_on_block.sql（同じ理由の前例）
--
-- greatest(..., 0) は保険。カウントがズレても負の件数を画面に出さない
-- （ズレ自体を直す手段は現状なく、統合テストで一致を担保している）
-- ============================================

create or replace function public.sync_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  end if;

  -- posts ごと削除された場合は行が既に無く 0件更新になる（cascade 削除の経路）
  update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

comment on function public.sync_post_like_count() is
  'likes の増減を posts.like_count に反映する。posts_update_own（作者のみ）を
   バイパスする必要があるため security definer';

create trigger likes_sync_like_count
  after insert or delete on public.likes
  for each row execute function public.sync_post_like_count();

-- ============================================
-- カウント更新で updated_at を動かさない
--
-- posts_updated_at は before update on posts for each row なので、素のままだと
-- 他人がいいねするたびに投稿の updated_at が動く。updated_at は「作者が本文を
-- 編集した時刻」として読めるべきで、他人の操作で動くと「最終更新」を何かの判断に
-- 使い始めた瞬間に破綻する。カウント列だけの UPDATE では発火させない。
--
-- 3つのカウント列をまとめて見るのは、comment_count / bookmark_count も同じ形の
-- トリガーで維持する予定があるため（ここで1度だけ直す）
-- ============================================

drop trigger posts_updated_at on public.posts;

create trigger posts_updated_at
  before update on public.posts
  for each row
  when (
    old.like_count is not distinct from new.like_count
    and old.comment_count is not distinct from new.comment_count
    and old.bookmark_count is not distinct from new.bookmark_count
  )
  execute function public.set_updated_at();

-- ============================================
-- RLS
--
-- SELECT は全ユーザーに開ける（tables.md #likes）。user_cafe_lists を本人限定に
-- したのとは判断が異なる: 「誰が何にいいねしたか」は SNS の公開情報で、閉じると
-- 他人のカードで like_count と実データの突き合わせができなくなる。
-- 「いいねした人の一覧」画面はワイヤーに無いので UI には出さない。
--
-- 通知（返報性）はここでは発火させない。notifications テーブルが未作成のため
-- （user_settings.notify_like だけが先に在る）。docs/product/pending-items.md D35
-- ============================================

alter table public.likes enable row level security;

create policy likes_select_all
  on public.likes for select
  using (true);

-- CLAUDE.md「未成年アカウントは追加のガード」。suspended / pending_consent は
-- いいねできない（user_cafe_lists_insert_own と同じ）
create policy likes_insert_own
  on public.likes for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- 解除は停止中でも通す。自分のいいねを外せない状態に閉じ込めない
create policy likes_delete_own
  on public.likes for delete
  to authenticated
  using (user_id = (select auth.uid()));
