-- ============================================
-- get_owner_verification_cafe: 申請者本人が「却下・審査中の申請先カフェ」の
-- 基本情報を見るための関数
--
-- cafes の SELECT RLS（cafes_select_active_anon / _authenticated）は status='active'
-- のカフェしか見せない。申請中にカフェが closed/hidden になると、本人からも cafes 行が
-- 見えなくなり、cafe_owner_verifications と cafes を埋め込み select（cafe:cafes!...）で
-- 結合したときに cafe が null になって S_OWNER_PENDING が本人の申請自体を見失う。
-- is_cafe_owner()（20260906140000_create_cafe_business_hours.sql）と同じ理由の
-- security definer。exists 句で「自分が実際に申請した cafe_id」以外への悪用を防ぐ
--   docs/architecture/data-model/tables.md #cafe_owner_verifications
-- ============================================

create or replace function public.get_owner_verification_cafe(p_cafe_id uuid)
returns table (id uuid, name text, area_label text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, a.label
  from public.cafes c
  left join public.areas a on a.code = c.area_code
  where c.id = p_cafe_id
    and exists (
      select 1 from public.cafe_owner_verifications v
      where v.cafe_id = p_cafe_id and v.user_id = (select auth.uid())
    )
$$;

comment on function public.get_owner_verification_cafe(uuid) is
  '申請者本人がカフェの status に関わらず自分の申請先カフェ名を見るための関数。
   exists 句で他人の申請先カフェの閲覧を防ぐ';

revoke execute on function public.get_owner_verification_cafe(uuid) from public;
grant execute on function public.get_owner_verification_cafe(uuid) to authenticated;
