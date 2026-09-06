-- ============================================
-- cafe_congestion_reports: ユーザー投稿による混雑度報告（1〜5段階）
--
-- S_CAFE_DETAIL の混雑度表示に使う。表示ロジックは3段階フォールバック
-- （直近30分平均 → 過去4週間同曜日同時間帯平均 → データなし）。
-- スパム対策（連続投稿のクールダウン等）は MVP では入れない
-- （docs/product/pending-items.md A4「スパム対策」）。
--   docs/architecture/data-model/tables.md #cafe_congestion_reports
-- ============================================

create table public.cafe_congestion_reports (
  id           uuid primary key default gen_random_uuid(),
  cafe_id      uuid not null references public.cafes (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  level        smallint not null,
  reported_at  timestamptz not null default now(),

  constraint cafe_congestion_reports_level_check check (level between 1 and 5)
);

create index cafe_congestion_reports_cafe_reported_at_idx
  on public.cafe_congestion_reports (cafe_id, reported_at desc);

-- extract(dow/hour from timestamptz) はセッションのタイムゾーンに依存するため
-- IMMUTABLE ではない（インデックス式には使えない）。UTC固定にして式を安定させる
create index cafe_congestion_reports_cafe_dow_hour_idx
  on public.cafe_congestion_reports (
    cafe_id,
    extract(dow from reported_at at time zone 'utc'),
    extract(hour from reported_at at time zone 'utc')
  );

-- ============================================
-- RLS: SELECT 全ユーザー / INSERT 認証済み本人 / UPDATE・DELETE 不可
-- ============================================

alter table public.cafe_congestion_reports enable row level security;

create policy cafe_congestion_reports_select_all
  on public.cafe_congestion_reports for select
  using (true);

create policy cafe_congestion_reports_insert_own
  on public.cafe_congestion_reports for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- UPDATE・DELETE はポリシーを置かない（＝拒否）。投稿し直しは新規INSERTで行う。

-- ============================================
-- get_cafe_congestion_current: 現在の混雑度（3段階フォールバック）
--
-- security invoker（既定）のまま。SELECT が全ユーザーに開いているので
-- 呼び出し元のロールに関わらず同じ結果になる。
--   docs/architecture/data-model/tables.md #cafe_congestion_reports
-- ============================================

create or replace function public.get_cafe_congestion_current(p_cafe_id uuid)
returns table (level_avg numeric, source text, sample_count int)
language sql
stable
set search_path = ''
as $$
  with recent as (
    select avg(level)::numeric as avg_level, count(*) as n
    from public.cafe_congestion_reports
    where cafe_id = p_cafe_id
      and reported_at >= now() - interval '30 minutes'
  ),
  historical as (
    select avg(level)::numeric as avg_level, count(*) as n
    from public.cafe_congestion_reports
    where cafe_id = p_cafe_id
      and extract(dow from reported_at at time zone 'utc') = extract(dow from now() at time zone 'utc')
      and extract(hour from reported_at at time zone 'utc')
        between extract(hour from now() at time zone 'utc')::int - 1
            and extract(hour from now() at time zone 'utc')::int + 1
      and reported_at >= now() - interval '4 weeks'
  )
  select
    coalesce(recent.avg_level, historical.avg_level) as level_avg,
    case
      when recent.n > 0 then 'recent'
      when historical.n > 0 then 'historical'
      else 'none'
    end as source,
    -- count(*) は0件時も NULL ではなく0を返すため、recent.n は coalesce では
    -- 絶対に読み飛ばされない。source の分岐と同じ条件で明示的に選ぶ
    (case when recent.n > 0 then recent.n else historical.n end)::int as sample_count
  from recent, historical;
$$;

comment on function public.get_cafe_congestion_current(uuid) is
  '直近30分の平均→なければ過去4週間の同曜日同時間帯平均→どちらもなければ none。S_CAFE_DETAIL の混雑度セクションが呼ぶ';

grant execute on function public.get_cafe_congestion_current(uuid) to anon, authenticated;
