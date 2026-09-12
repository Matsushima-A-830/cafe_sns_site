-- ============================================
-- areas: エリアマスタ（制覇マップ・検索フィルタ）
--
-- コード体系は ISO 3166-2 準拠（JP-13-shibuya-ku）。階層は 1段のみ。
--   docs/architecture/data-model/tables.md #areas
--   docs/seed/areas-initial-set.md
-- ============================================

create table public.areas (
  code            text primary key,
  prefecture_code text not null,
  slug            text not null,
  label           text not null,
  label_kana      text,
  level           text not null,
  parent_code     text references public.areas (code) on delete restrict,
  center_location extensions.geography(point, 4326),
  priority        smallint not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),

  constraint areas_prefecture_slug_key unique (prefecture_code, slug),
  constraint areas_code_matches_slug check (code = prefecture_code || '-' || slug),
  constraint areas_level_check check (level in ('ward', 'sub_area')),
  constraint areas_parent_not_self check (parent_code is distinct from code),
  -- 階層は1段のみ。ward が親を持つと階層走査が循環し、23区制覇の母数もずれる
  constraint areas_hierarchy_check check (
    (level = 'ward' and parent_code is null) or level = 'sub_area'
  )
);

comment on table public.areas is 'エリアマスタ。code は変更禁止（is_active=false にして新コードを作る）';
comment on column public.areas.level is
  'ward=市区町村レベル / sub_area=副地域。「23区制覇」の母数は level=ward で数える（吉祥寺の混入を防ぐ）';
comment on column public.areas.center_location is
  '地図中心座標。45件ぶん未収集のため seed では NULL（pending-items A3）';

create index areas_prefecture_priority_idx on public.areas (prefecture_code, priority desc);
create index areas_prefecture_level_idx on public.areas (prefecture_code, level);
create index areas_parent_code_idx on public.areas (parent_code);
create index areas_center_location_idx on public.areas using gist (center_location);

-- ============================================
-- RLS
-- ============================================

alter table public.areas enable row level security;

create policy areas_select_active
  on public.areas for select
  using (is_active);

-- INSERT / UPDATE / DELETE のポリシーは意図的に置いていない。
-- ポリシー不在 = anon / authenticated からの書き込みは全拒否。
-- admin 用の書き込みポリシーは profiles と is_admin() を作る PR で追加する
-- （pending-items A9）。seed は service_role で流すため影響しない。
