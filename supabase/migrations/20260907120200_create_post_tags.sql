-- ============================================
-- post_tags: 投稿とタグの中間テーブル
--
-- user_interest_tags と同じ「上限N個」パターン（こちらは1投稿5個まで）。
--   docs/architecture/data-model/tables.md #post_tags
-- ============================================

create table public.post_tags (
  post_id    uuid not null references public.posts (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (post_id, tag_id)
);

-- タグからの逆引き
create index post_tags_tag_post_idx on public.post_tags (tag_id, post_id);

-- ============================================
-- タグ数の上限（1投稿5個）
-- docs/architecture/error-catalog.md POST_TAGS_LIMIT_EXCEEDED
--
-- security definer にする理由: enforce_post_images_limit と同じ。invoker だと
-- count(*) が post_tags_select_visible（posts_select 継承）越しになり、
-- posts を archived にしてから挿入すれば毎回 count=0 になって上限が無効化される
-- ============================================

create or replace function public.enforce_post_tags_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  select count(*) into current_count
  from public.post_tags where post_id = new.post_id;
  if current_count >= 5 then
    raise exception 'POST_TAGS_LIMIT_EXCEEDED';
  end if;
  return new;
end;
$$;

create trigger post_tags_enforce_limit
  before insert on public.post_tags
  for each row execute function public.enforce_post_tags_limit();

-- ============================================
-- RLS
-- ============================================

alter table public.post_tags enable row level security;

-- post_images_select_visible と同じ理由。`using (true)` だと posts_select が
-- 隠す投稿（archived/hidden・followers限定・ブロック相手）のタグだけが漏れる。
-- is_post_author の OR も同様に、作者本人が自分の archived/hidden な投稿の
-- タグを編集画面で見られるようにするため
create policy post_tags_select_visible
  on public.post_tags for select
  to anon, authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_tags.post_id)
    or public.is_post_author(post_id)
  );

create policy post_tags_insert_own
  on public.post_tags for insert
  to authenticated
  with check (public.is_post_author(post_id) and (select public.is_active_user()));

create policy post_tags_delete_own
  on public.post_tags for delete
  to authenticated
  using (public.is_post_author(post_id));
