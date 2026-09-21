-- ============================================
-- get_owned_cafe: 本人が verified_owner_id のカフェを status に関わらず見るための関数
--
-- cafes の SELECT RLS（cafes_select_active_authenticated）は status='active' の
-- カフェしか見せない。getOwnedCafe（lib/owner/dashboard.ts）はこれまで素朴な select で
-- verified_owner_id = userId を引いていたため、カフェが closed/hidden になった瞬間
-- 本人からもカフェが見えなくなり、S_POST_OFFICIAL（/new/official）で NOT_OWNER 扱いに
-- なってしまう ——「臨時休業を告知したいまさにその状況」で告知できないという
-- 本末転倒が起きていた（/code-review 指摘）。get_owner_verification_cafe
-- （20260921080000）と同じ考え方の security definer で解決する
--   docs/product/pending-items.md D55
-- ============================================

create or replace function public.get_owned_cafe()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name
  from public.cafes c
  where c.verified_owner_id = (select auth.uid())
  limit 1
$$;

comment on function public.get_owned_cafe() is
  '呼び出し元本人が verified_owner_id のカフェを status に関わらず返す
  （getOwnedCafe が「1申請=1カフェ」前提で先頭1件だけを見る設計はそのまま踏襲）。
   docs/product/pending-items.md D55';

revoke execute on function public.get_owned_cafe() from public;
grant execute on function public.get_owned_cafe() to authenticated;
