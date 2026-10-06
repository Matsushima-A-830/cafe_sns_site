-- ============================================
-- get_owned_cafe_detail: 本人が verified_owner_id の指定カフェを status に
-- 関わらず S_CAFE_DETAIL のフル列（CAFE_COLUMNS 相当）で返す
--
-- cafes の SELECT RLS（cafes_select_active_authenticated）は status='active' の
-- カフェしか見せない。get_owned_cafe・get_owned_cafe_for_edit・
-- get_owned_cafe_for_dashboard と同じ理由で、素朴な select だとカフェが closed/hidden の
-- 間はオーナー本人が S_CAFE_DETAIL を開けなくなる（閉店告知をした直後に本人だけ
-- 締め出される、という本末転倒）。
--
-- lib/cafes/cafe-detail.ts の CAFE_COLUMNS は areas!cafes_area_code_fkey (label) という
-- PostgREST の埋め込み join 構文を使っており、素の SQL 関数では再現できないため、
-- areas を明示的に left join して area_label を直接返す形にする。
-- cafe_lat/cafe_lng は cafes の実列ではなく PostgREST computed column（関数、
-- 20260928131058_add_cafe_lat_lng_computed_columns.sql）なので c.cafe_lat とは書けず、
-- public.cafe_lat(c) / public.cafe_lng(c) として呼ぶ
--   docs/product/pending-items.md D55
-- ============================================

create or replace function public.get_owned_cafe_detail(p_cafe_id uuid)
returns table (
  id uuid,
  name text,
  prefecture text,
  city text,
  address text,
  phone text,
  website text,
  description text,
  verified_owner_id uuid,
  cafe_lat double precision,
  cafe_lng double precision,
  area_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.name, c.prefecture, c.city, c.address, c.phone, c.website, c.description,
    c.verified_owner_id, public.cafe_lat(c), public.cafe_lng(c), a.label as area_label
  from public.cafes c
  left join public.areas a on a.code = c.area_code
  where c.id = p_cafe_id
    and c.verified_owner_id = (select auth.uid())
$$;

comment on function public.get_owned_cafe_detail(uuid) is
  '呼び出し元本人が verified_owner_id の指定カフェを status に関わらず S_CAFE_DETAIL の
   フル列で返す。where 句で他人のカフェへのアクセスを防ぐ。docs/product/pending-items.md D55';

revoke execute on function public.get_owned_cafe_detail(uuid) from public;
grant execute on function public.get_owned_cafe_detail(uuid) to authenticated;
