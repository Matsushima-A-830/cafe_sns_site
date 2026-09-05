-- ============================================
-- tags: タグマスタ
--
-- 幹A（気分起点の発見）の中核。occasion を最上位に出すため priority を持つ。
-- area カテゴリは areas マスタが正なので初期セットには含めない。
--   docs/architecture/data-model/tables.md #tags
--   docs/seed/curated-tags-initial-set.md
-- ============================================

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  category    text not null,
  priority    smallint not null default 0,
  description text,
  usage_count integer not null default 0,
  is_curated  boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint tags_category_check check (category in ('area', 'mood', 'occasion', 'other')),
  constraint tags_usage_count_check check (usage_count >= 0)
);

comment on column public.tags.priority is '表示優先度。厳選タグは occasion=100 / mood=50 / other=10 の3値';
comment on column public.tags.is_curated is '運営厳選タグ。UI はこちらを優先表示する';

-- 「今、どんなカフェ気分？」のカテゴリ別 priority 順表示
create index tags_category_priority_idx on public.tags (category, priority desc);

-- ============================================
-- RLS
-- ============================================

alter table public.tags enable row level security;

create policy tags_select_all
  on public.tags for select
  using (true);

-- 書き込みポリシーは areas と同じ理由で未設定（pending-items A9）。
-- usage_count を維持するトリガーは post_tags を作る PR で SECURITY DEFINER として足す。
