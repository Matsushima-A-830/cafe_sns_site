-- ============================================
-- get_owned_cafe_for_edit / get_owned_cafe_detail に main_image_path を追加する
--
-- D31でメイン画像アップロード導線ができたため、どちらの関数も列を揃える必要がある。
-- RETURNS TABLE の列構成を変える CREATE OR REPLACE は Postgres が拒否するため、
-- 先に DROP してから作り直す
--   docs/product/pending-items.md D31
-- ============================================

drop function if exists public.get_owned_cafe_for_edit(uuid);

create function public.get_owned_cafe_for_edit(p_cafe_id uuid)
returns table (
  id uuid,
  name text,
  name_kana text,
  prefecture text,
  city text,
  area_code text,
  address text,
  phone text,
  website text,
  description text,
  external_ids jsonb,
  main_image_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.name, c.name_kana, c.prefecture, c.city, c.area_code,
    c.address, c.phone, c.website, c.description, c.external_ids, c.main_image_path
  from public.cafes c
  where c.id = p_cafe_id
    and c.verified_owner_id = (select auth.uid())
$$;

comment on function public.get_owned_cafe_for_edit(uuid) is
  '呼び出し元本人が verified_owner_id の指定カフェを status に関わらずフル列で返す。
   where 句で他人のカフェへのアクセスを防ぐ。docs/product/pending-items.md D55';

revoke execute on function public.get_owned_cafe_for_edit(uuid) from public;
grant execute on function public.get_owned_cafe_for_edit(uuid) to authenticated;

drop function if exists public.get_owned_cafe_detail(uuid);

create function public.get_owned_cafe_detail(p_cafe_id uuid)
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
  area_label text,
  main_image_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.name, c.prefecture, c.city, c.address, c.phone, c.website, c.description,
    c.verified_owner_id, public.cafe_lat(c), public.cafe_lng(c), a.label as area_label,
    c.main_image_path
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
