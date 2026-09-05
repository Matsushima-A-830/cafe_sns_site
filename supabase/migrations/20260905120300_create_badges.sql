-- ============================================
-- badges: バッジマスタ
--
-- 付与判定は DBトリガーではなく lib/badges/check.ts の checkAndAwardBadges に一元化する。
-- criteria はその判定ルールの入力（type で判別、threshold は全 type 共通）。
--   docs/architecture/data-model/tables.md #badges
--   docs/seed/badges-initial-set.md
-- ============================================

create table public.badges (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  icon_url    text,
  criteria    jsonb not null,
  created_at  timestamptz not null default now(),

  -- type の値そのものは列挙しない。フェーズ2でバッジ種別が増えるたびに
  -- マイグレーションを打つのは割に合わないため、共通の骨格だけを守る。
  --
  -- coalesce が要る: jsonb_typeof は STRICT なのでキーが無いと NULL を返し、
  -- CHECK は NULL を「通過」と扱うため、'{}' が素通りしてしまう
  constraint badges_criteria_shape_check check (
    coalesce(jsonb_typeof(criteria -> 'type'), '') = 'string'
    and coalesce(jsonb_typeof(criteria -> 'threshold'), '') = 'number'
  )
);

comment on column public.badges.criteria is
  '付与条件。{"type": <判定種別>, "threshold": <閾値>, ...} 形式。docs/seed/badges-initial-set.md 参照';

-- ============================================
-- RLS
-- ============================================

alter table public.badges enable row level security;

create policy badges_select_all
  on public.badges for select
  using (true);

-- 書き込みポリシーは areas と同じ理由で未設定（pending-items A9）
