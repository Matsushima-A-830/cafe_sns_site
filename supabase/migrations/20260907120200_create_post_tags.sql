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
-- ============================================

create or replace function public.enforce_post_tags_limit()
returns trigger
language plpgsql
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

create policy post_tags_select_all
  on public.post_tags for select
  using (true);

create policy post_tags_insert_own
  on public.post_tags for insert
  to authenticated
  with check (public.is_post_author(post_id));

create policy post_tags_delete_own
  on public.post_tags for delete
  to authenticated
  using (public.is_post_author(post_id));
