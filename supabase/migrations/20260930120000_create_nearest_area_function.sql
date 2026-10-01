-- ============================================
-- nearest_area: 現在地から最寄りのエリア（区）を1件返す。
--
-- S_ONBOARD_AREA（ホームエリア選択）の「現在地から検索」で使う。areas.center_location は
-- A3（pending-items）で45件すべて座標投入済み。nearby_cafes と同じKNNパターン
-- （GISTインデックス + <-> 演算子）を使う。security invoker のままにし、
-- areas_select_active（is_active のみで絞る公開読み取り）をそのまま継承する
-- （definer にする理由がない）。
--
-- level は 'ward' 固定（23区制覇の母数と同じ粒度。sub_area まで候補に含めると
-- 「下北沢が最寄りなのに世田谷区が選ばれない」ような見え方になり、S_MAP・S_CAFE_NEW・
-- S_ONBOARD_AREA いずれも ward のみを選択肢にしている既存方針とズレるため引数化しない）
--   docs/design/wireframes/auth.md #S_ONBOARD_AREA
--   docs/architecture/data-model/tables.md #areas
-- ============================================

create function public.nearest_area(
  p_lat double precision,
  p_lng double precision
)
returns table (
  area_code text,
  label text,
  distance_m double precision
)
language sql
stable
set search_path = ''
as $$
  select
    a.code,
    a.label,
    extensions.st_distance(
      a.center_location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    )
  from public.areas a
  where a.center_location is not null
    and a.level = 'ward'
    and a.is_active
  order by
    a.center_location operator(extensions.<->)
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  limit 1
$$;

comment on function public.nearest_area(double precision, double precision) is
  'S_ONBOARD_AREA: 現在地から最寄りの区（level=ward）を1件、KNN距離順で返す。RLSに認可を委譲するため security invoker';

revoke execute on function public.nearest_area(double precision, double precision) from public;
grant execute on function public.nearest_area(double precision, double precision) to anon, authenticated;
