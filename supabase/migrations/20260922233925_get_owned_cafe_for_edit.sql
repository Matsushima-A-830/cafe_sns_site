-- ============================================
-- get_owned_cafe_for_edit: 本人が verified_owner_id の指定カフェを status に
-- 関わらずフル列で返す（S_OWNER_CAFE_EDIT のプリフィル用）
--
-- cafes の SELECT RLS（cafes_select_active_authenticated）は status='active' の
-- カフェしか見せない。get_owned_cafe（20260921235044）と同じ理由で、素朴な select
-- だとカフェが closed/hidden の間は編集フォームの現在値取得すら本人からできなくなる
-- （closed/hidden から復帰させたいまさにその場面で編集できないという本末転倒）。
-- get_owned_cafe は {id, name} しか返さないため、編集フォームに必要な列を
-- 揃えた別関数として持つ。p_cafe_id を引数に取るのは、1ユーザーが将来複数カフェの
-- verified_owner_id を持つ可能性（pending-items D53）に備え、どの店を編集するか
-- 呼び出し元 URL（/owner/[cafeId]/edit）の cafeId で明示させるため
--   docs/product/pending-items.md D31 / D55
-- ============================================

create or replace function public.get_owned_cafe_for_edit(p_cafe_id uuid)
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
  external_ids jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.name, c.name_kana, c.prefecture, c.city, c.area_code,
    c.address, c.phone, c.website, c.description, c.external_ids
  from public.cafes c
  where c.id = p_cafe_id
    and c.verified_owner_id = (select auth.uid())
$$;

comment on function public.get_owned_cafe_for_edit(uuid) is
  '呼び出し元本人が verified_owner_id の指定カフェを status に関わらずフル列で返す。
   where 句で他人のカフェへのアクセスを防ぐ。docs/product/pending-items.md D55';

revoke execute on function public.get_owned_cafe_for_edit(uuid) from public;
grant execute on function public.get_owned_cafe_for_edit(uuid) to authenticated;
