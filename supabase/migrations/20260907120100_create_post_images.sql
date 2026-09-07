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

revoke execute on function public.is_post_author(uuid) from public;
grant execute on function public.is_post_author(uuid) to authenticated;

-- ============================================
-- 画像枚数の上限（1投稿10枚）
-- docs/architecture/error-catalog.md POST_IMAGES_LIMIT_EXCEEDED
-- ============================================

create or replace function public.enforce_post_images_limit()
returns trigger
language plpgsql
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

create policy post_images_select_all
  on public.post_images for select
  using (true);

create policy post_images_insert_own
  on public.post_images for insert
  to authenticated
  with check (public.is_post_author(post_id));

create policy post_images_delete_own
  on public.post_images for delete
  to authenticated
  using (public.is_post_author(post_id));

-- UPDATE ポリシーは置かない（並べ替え等が必要になったら追加検討）
