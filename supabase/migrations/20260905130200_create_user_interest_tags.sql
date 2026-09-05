-- ============================================
-- user_interest_tags: 「好きな気分」（S_ONBOARD_INTERESTS / 幹A）
--
-- 幹A のレコメンドはこの行を入力にする。
--   docs/architecture/data-model/tables.md #user_interest_tags
-- ============================================

create table public.user_interest_tags (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, tag_id)
);

-- 「同じ気分の人」の逆引き
create index user_interest_tags_tag_user_idx on public.user_interest_tags (tag_id, user_id);

-- ============================================
-- 入力の制限
-- ============================================

-- UI は1〜5個。上限だけ DB でも担保する。
-- 最低1個は profiles.onboarded_at の書き込み側で担保し、DB制約にはしない
-- （選択と完了フラグ書き込みの間に一瞬0件の状態があるため）。
--
-- 選べるのは occasion / mood のみ（ワイヤーフレームの2タブに対応）。
create or replace function public.enforce_user_interest_tags_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tag_category text;
  current_count integer;
begin
  select category into tag_category from public.tags where id = new.tag_id;
  if tag_category is null or tag_category not in ('occasion', 'mood') then
    raise exception 'TAG_CATEGORY_NOT_ALLOWED';
  end if;

  select count(*) into current_count
  from public.user_interest_tags where user_id = new.user_id;
  if current_count >= 5 then
    raise exception 'INTEREST_TAGS_LIMIT';
  end if;

  return new;
end;
$$;

create trigger user_interest_tags_enforce_rules
  before insert on public.user_interest_tags
  for each row execute function public.enforce_user_interest_tags_rules();

-- ============================================
-- RLS
-- ============================================

alter table public.user_interest_tags enable row level security;

-- 「同じ気分の人」の集計に使うので参照は全公開
create policy user_interest_tags_select_all
  on public.user_interest_tags for select
  using (true);

create policy user_interest_tags_insert_own
  on public.user_interest_tags for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_interest_tags_delete_own
  on public.user_interest_tags for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- UPDATE ポリシーは置かない（付け替えは DELETE + INSERT）
