-- ============================================
-- S_OWNER_ANALYTICS（投稿分析）向けの集計 RPC。
--   docs/design/wireframes/owner.md#s_owner_analytics投稿分析
--
-- get_cafe_top_posters: 投稿者トップ（ユーザー単位の投稿数）
-- get_cafe_weekday_congestion: 混雑度平均（曜日別）
-- ============================================

-- ============================================
-- get_cafe_top_posters
--
-- get_regular_candidates と同じ理由で security definer + is_cafe_owner() ガードを
-- 持たせる。posts 自体は公開情報だが、ユーザー単位の活動量ランキングという
-- 集計の形は get_regular_candidates と同種のため、一貫性のためガードを揃える
--   supabase/migrations/20260923010000_create_regular_customers.sql
-- ============================================

create or replace function public.get_cafe_top_posters(
  p_cafe_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  post_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_cafe_owner(p_cafe_id) or public.is_admin()) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    p.author_id as user_id,
    prof.username::text,
    prof.display_name,
    prof.avatar_url,
    count(*)::int as post_count
  from public.posts p
  join public.profiles prof on prof.id = p.author_id
  where p.cafe_id = p_cafe_id
    and p.status = 'published'
    and p.deleted_at is null
    and p.published_at >= p_from
    and p.published_at < p_to
  group by p.author_id, prof.username, prof.display_name, prof.avatar_url
  order by post_count desc, max(p.published_at) desc
  limit 10;
end;
$$;

comment on function public.get_cafe_top_posters(uuid, timestamptz, timestamptz) is
  '指定期間 [p_from, p_to) の投稿数が多いユーザー上位10名。呼び出し元が対象カフェの
   verified_owner_id 本人（または admin）でなければ FORBIDDEN を raise する。
   S_OWNER_ANALYTICS の「投稿者トップ」が呼ぶ';

revoke execute on function public.get_cafe_top_posters(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_cafe_top_posters(uuid, timestamptz, timestamptz) to authenticated;

-- ============================================
-- get_cafe_weekday_congestion
--
-- cafe_congestion_reports の SELECT は「本人 + admin」限定のため、get_cafe_congestion_current
-- と同じ理由で security definer にする。この関数は「今の混雑度」ではなく「曜日ごとの
-- 傾向」を人（日本のオーナー）に見せるためのものなので、get_cafe_congestion_current の
-- UTC ±1時間バケット照合（時刻無依存の設計）とは違い、曜日そのものが出力になる。
-- reported_at をそのまま `at time zone 'utc'` で dow を取ると、JST 0〜8時台の投稿が
-- 前日の曜日に数えられてしまい「月曜が混む」が「日曜が混む」に化けるため、
-- ここでは 'Asia/Tokyo' で曜日を取り直す（保存はUTC timestamptzのまま、集計時にJST変換）
--
-- p_from/p_to を意図的に取らない: 曜日別の傾向は他の集計（投稿数・タグ等）より
-- サンプル数が少ないため、S_OWNER_ANALYTICS の期間トグル（4週間/12週間）で絞ると
-- 特に短い方でデータがさらに薄くなる。全期間のデータを使うことでこれを避ける
-- （docs/product/pending-items.md D57）
-- ============================================

create or replace function public.get_cafe_weekday_congestion(p_cafe_id uuid)
returns table (
  day_of_week smallint,
  level_avg numeric,
  sample_count int
)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(0, 6) as dow
  ),
  reports as (
    select
      extract(dow from reported_at at time zone 'Asia/Tokyo')::smallint as dow,
      level
    from public.cafe_congestion_reports
    where cafe_id = p_cafe_id
  )
  select
    days.dow::smallint as day_of_week,
    avg(reports.level)::numeric as level_avg,
    count(reports.level)::int as sample_count
  from days
  left join reports on reports.dow = days.dow
  group by days.dow
  order by days.dow;
$$;

comment on function public.get_cafe_weekday_congestion(uuid) is
  '曜日別（JST基準、0=日〜6=土）の混雑度平均。データが無い曜日は level_avg が NULL・
   sample_count が0で返る。get_cafe_congestion_current と同じく集計値のみで
   user_id・reported_at 単位の生データは含まないため、公開情報として扱う
   （anon/authenticated どちらも呼べる）。S_OWNER_ANALYTICS が呼ぶ';

revoke execute on function public.get_cafe_weekday_congestion(uuid) from public;
grant execute on function public.get_cafe_weekday_congestion(uuid) to anon, authenticated;
