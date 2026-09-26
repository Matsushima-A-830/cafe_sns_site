-- ============================================
-- nearby_cafes: S_MAP（地図ビュー）が座標を持つカフェを閲覧者位置からの
-- 距離順に取得するための関数。
--
-- PostgREST は geography 列を直接 select すると WKB hex を返すため、lat/lng・距離を
-- 露出するには関数が必須（generated column では代替できない）。距離順は GIST インデックスを
-- 活かす KNN 演算子 `<->` を使う。security invoker（デフォルト）のままにして、
-- cafes_select_active_anon / _authenticated の RLS をそのまま効かせる
-- （非公開カフェを漏らさないため。get_owner_verification_cafe 等の security definer とは
-- 異なり、ここは公開読み取りだけなので definer にする理由がない）
--   docs/architecture/data-model/tables.md #cafes
-- ============================================

create or replace function public.nearby_cafes(
  p_lat double precision,
  p_lng double precision,
  p_area_code text default null,
  p_query text default null,
  p_limit int default 100
)
returns table (
  cafe_id uuid,
  name text,
  area_code text,
  area_label text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  is_verified boolean
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.area_code,
    a.label,
    extensions.st_y(c.location::extensions.geometry),
    extensions.st_x(c.location::extensions.geometry),
    extensions.st_distance(
      c.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ),
    c.verified_owner_id is not null
  from public.cafes c
  left join public.areas a on a.code = c.area_code
  where c.location is not null
    and (p_area_code is null or c.area_code = p_area_code)
    and (p_query is null or position(lower(p_query) in lower(c.name)) > 0)
  order by
    c.location operator(extensions.<->)
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  limit p_limit
$$;

comment on function public.nearby_cafes(double precision, double precision, text, text, int) is
  'S_MAP: 座標のあるカフェを閲覧者位置からの距離順に返す。RLSに認可を委譲するため security invoker';

revoke execute on function public.nearby_cafes(double precision, double precision, text, text, int) from public;
grant execute on function public.nearby_cafes(double precision, double precision, text, text, int) to anon, authenticated;
