-- ============================================
-- get_owned_cafe_for_dashboard: 本人が verified_owner_id の指定カフェを status に
-- 関わらず {id, name} で返す（S_OWNER_DASHBOARD の本人確認＋表示名取得用）
--
-- cafes の SELECT RLS（cafes_select_active_authenticated）は status='active' の
-- カフェしか見せない。get_owned_cafe（20260921235044）・get_owned_cafe_for_edit
-- （20260922233925）と同じ理由で、素朴な select だとカフェが closed/hidden の間は
-- オーナー本人がダッシュボードを開けなくなる（閉店告知をした直後に本人だけ
-- ダッシュボードから締め出される、という本末転倒）。ダッシュボードが必要とするのは
-- 本人確認と見出しの name だけなので、get_owned_cafe_for_edit のようなフル列は返さない
--   docs/product/pending-items.md D55
-- ============================================

create or replace function public.get_owned_cafe_for_dashboard(p_cafe_id uuid)
returns table (
  id uuid,
  name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name
  from public.cafes c
  where c.id = p_cafe_id
    and c.verified_owner_id = (select auth.uid())
$$;

comment on function public.get_owned_cafe_for_dashboard(uuid) is
  '呼び出し元本人が verified_owner_id の指定カフェを status に関わらず {id, name} で返す。
   where 句で他人のカフェへのアクセスを防ぐ。docs/product/pending-items.md D55';

revoke execute on function public.get_owned_cafe_for_dashboard(uuid) from public;
grant execute on function public.get_owned_cafe_for_dashboard(uuid) to authenticated;
