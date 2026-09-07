-- ============================================
-- post_images: 投稿画像（Supabase Storage `post-images` バケット連携）
--
-- EXIF除去・WebP変換はアプリ層（アップロード前）の責務。ここでは
-- オブジェクトパスと表示順のみを管理する。
--   docs/architecture/data-model/tables.md #post_images
--   docs/architecture/data-model/README.md #ストレージ設計
-- ============================================

create table public.post_images (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid not null references public.posts (id) on delete cascade,
  storage_path   text not null,
  display_order  smallint not null default 0,
  width          int,
  height         int,
  alt_text       text,
  created_at     timestamptz not null default now()
);

comment on column public.post_images.storage_path is
  'post-images/{author_id}/{post_id}/{uuid}.webp 規約のオブジェクトパス。
   公開URLではなくパスを保存する（Storage側は公開バケットのため署名URL不要）。
   docs/architecture/data-model/README.md #ストレージ設計';

create index post_images_post_id_idx on public.post_images (post_id, display_order);

-- ============================================
-- is_post_author: 呼び出し元が指定投稿の author_id 本人か
--
-- posts の SELECT RLS は status='published' 以外を隠すため、archived/hidden な
-- 自分の投稿の画像を管理できなくなる。is_cafe_owner() と同じ理由で
-- security definer にして posts の RLS をバイパスする
-- ============================================

create or replace function public.is_post_author(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts
    where id = p_post_id and author_id = (select auth.uid())
  );
$$;

comment on function public.is_post_author(uuid) is
  '呼び出し元が指定投稿の author_id 本人か。posts の SELECT RLS をバイパスするため security definer';

-- post_images_select_visible / post_tags_select_visible が anon にも
-- 使わせる（auth.uid() が null になるだけで常に false を返すため安全）
revoke execute on function public.is_post_author(uuid) from public;
grant execute on function public.is_post_author(uuid) to anon, authenticated;

-- ============================================
-- 画像枚数の上限（1投稿10枚）
-- docs/architecture/error-catalog.md POST_IMAGES_LIMIT_EXCEEDED
--
-- security definer にする理由: invoker のままだと count(*) が
-- post_images_select_visible（posts_select 継承）越しになる。posts を
-- archived にしてから挿入すれば posts_select が偽になり毎回 count=0 に
-- なるため、上限が完全に無効化されてしまう（published に戻せば無制限に
-- 貯められる）。is_post_author() と同じ理由でカウントは RLS をバイパスする
-- ============================================

create or replace function public.enforce_post_images_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  select count(*) into current_count
  from public.post_images where post_id = new.post_id;
  if current_count >= 10 then
    raise exception 'POST_IMAGES_LIMIT_EXCEEDED';
  end if;
  return new;
end;
$$;

create trigger post_images_enforce_limit
  before insert on public.post_images
  for each row execute function public.enforce_post_images_limit();

-- ============================================
-- RLS
-- ============================================

alter table public.post_images enable row level security;

-- posts 側の可視性（status/visibility/ブロック）をそのまま継承する。
-- `using (true)` にすると archived/hidden・followers限定・ブロック相手の投稿の
-- 画像だけが posts_select を素通りして見えてしまう。EXISTS のサブクエリは
-- 呼び出し元のロールで実行されるため posts_select の RLS がそのまま効く
-- （is_blocked_either_way のような security definer は不要 — あちらは
-- blocks 自体の SELECT RLS がブロッカー本人しか許さない特殊事情への対処だった）。
-- ただしこれだけだと posts_select が status='published' を要求するため、
-- 作者本人でも自分の archived/hidden な投稿の編集画面で画像が0枚に見えてしまう
-- （is_post_author を導入した理由そのもの）。is_post_author の OR で作者には
-- 常に見せる
create policy post_images_select_visible
  on public.post_images for select
  to anon, authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_images.post_id)
    or public.is_post_author(post_id)
  );

create policy post_images_insert_own
  on public.post_images for insert
  to authenticated
  with check (public.is_post_author(post_id) and (select public.is_active_user()));

create policy post_images_delete_own
  on public.post_images for delete
  to authenticated
  using (public.is_post_author(post_id));

-- UPDATE ポリシーは置かない（並べ替え等が必要になったら追加検討）
