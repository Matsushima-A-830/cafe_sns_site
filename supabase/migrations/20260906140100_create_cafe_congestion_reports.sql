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
-- RLS
--
-- is_active_user() は cafe_business_hours 側のマイグレーションで定義済み
-- （先に適用されるため。CLAUDE.md の profiles.status='active' ガード）。
--
-- SELECT は「本人 + admin」に限定する（reports テーブルと同じ方針）。
-- 生の行には user_id・cafe_id・reported_at が並び、突き合わせれば
-- 「誰が今どのカフェにいるか」まで割れてしまうため、位置情報に近い
-- 個人情報として扱う。集計値は get_cafe_congestion_current() 経由で
-- 全ユーザーに公開する（関数側は security definer でこの制限を回避する）。
--   docs/architecture/data-model/tables.md #cafe_congestion_reports
-- ============================================

alter table public.cafe_congestion_reports enable row level security;

create policy cafe_congestion_reports_select_own
  on public.cafe_congestion_reports for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy cafe_congestion_reports_insert_own
  on public.cafe_congestion_reports for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- UPDATE・DELETE はポリシーを置かない（＝拒否）。投稿し直しは新規INSERTで行う。

-- ============================================
-- get_cafe_congestion_current: 現在の混雑度（3段階フォールバック）
--
-- security definer にする: SELECT ポリシーを「本人 + admin」に絞ったため、
-- invoker のままだと呼び出し元本人の投稿しか集計に乗らず、他ユーザーの
-- 投稿を含む本来の集計にならない。is_admin() と同じ理由で RLS を回避する
-- ============================================

create or replace function public.get_cafe_congestion_current(p_cafe_id uuid)
returns table (level_avg numeric, source text, sample_count int)
language sql
stable
security definer
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
      -- extract(hour ...) の between h-1 and h+1 は 0時/23時で日をまたぐ
      -- ラップができない（0時なら -1 が発生せず前日23時分が抜け、23時なら
      -- 24 が発生せず翌日0時分が抜ける）。now() 自体に interval を加減してから
      -- 曜日・時間を取り直すことで、日またぎを自然に処理する
      and (extract(dow from reported_at at time zone 'utc'), extract(hour from reported_at at time zone 'utc'))
        in (
          (extract(dow from (now() - interval '1 hour') at time zone 'utc'),
           extract(hour from (now() - interval '1 hour') at time zone 'utc')),
          (extract(dow from now() at time zone 'utc'),
           extract(hour from now() at time zone 'utc')),
          (extract(dow from (now() + interval '1 hour') at time zone 'utc'),
           extract(hour from (now() + interval '1 hour') at time zone 'utc'))
        )
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
  '直近30分の平均→なければ過去4週間の同曜日同時間帯平均→どちらもなければ none。
   S_CAFE_DETAIL の混雑度セクションが呼ぶ。level_avg は source=none のとき NULL に
   なるが、supabase gen types は RETURNS TABLE の列を non-nullable に生成するため、
   呼び出し側で型を信用せず NULL を扱うこと（tables.md の tiptap_to_plaintext と
   同じ注意点）';

revoke execute on function public.get_cafe_congestion_current(uuid) from public;
grant execute on function public.get_cafe_congestion_current(uuid) to anon, authenticated;
