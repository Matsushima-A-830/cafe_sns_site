-- ============================================
-- cafe_lat / cafe_lng: S_CAFE_DETAIL が1件のカフェの緯度経度を露出するための
-- PostgREST computed column（関数）。
--
-- nearby_cafes と同じ理由（20260926224028_create_nearby_cafes_function.sql 冒頭）で、
-- cafes.location を直接 select すると WKB hex しか返らず lat/lng は取れない。
-- ここは1カフェの座標を返すだけで距離計算や絞り込みは不要なため、nearby_cafes のような
-- テーブル関数ではなく computed column（第1引数に cafes 行を取る関数）にして
-- getCafeDetail の既存 select にそのまま列として足せるようにする
-- （PostgREST computed column は Postgres の GENERATED ALWAYS AS 列とは別物で、
-- generated column では代替できないという nearby_cafes のコメントとは矛盾しない）。
-- security invoker（デフォルト）のままにして cafes の RLS をそのまま効かせる
--   docs/architecture/data-model/tables.md #cafes
-- ============================================

create or replace function public.cafe_lat(c public.cafes)
returns double precision
language sql
stable
set search_path = ''
as $$
  select extensions.st_y(c.location::extensions.geometry)
$$;

create or replace function public.cafe_lng(c public.cafes)
returns double precision
language sql
stable
set search_path = ''
as $$
  select extensions.st_x(c.location::extensions.geometry)
$$;

comment on function public.cafe_lat(public.cafes) is
  'S_CAFE_DETAIL: cafes.location（geography）から緯度を取り出す PostgREST computed column';
comment on function public.cafe_lng(public.cafes) is
  'S_CAFE_DETAIL: cafes.location（geography）から経度を取り出す PostgREST computed column';

revoke execute on function public.cafe_lat(public.cafes) from public;
revoke execute on function public.cafe_lng(public.cafes) from public;
grant execute on function public.cafe_lat(public.cafes) to anon, authenticated;
grant execute on function public.cafe_lng(public.cafes) to anon, authenticated;
