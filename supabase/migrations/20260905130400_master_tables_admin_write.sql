-- ============================================
-- マスタ3テーブルへの admin 書き込みポリシー
--
-- 202609051201〜0300 では profiles が無く is_admin() を書けなかったため、
-- SELECT ポリシーだけを置いて書き込みを全拒否していた（pending-items A9）。
-- profiles が入ったのでここで開ける。
--   docs/architecture/data-model/tables.md #areas #tags #badges
-- ============================================

create policy areas_write_admin
  on public.areas for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy tags_write_admin
  on public.tags for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy badges_write_admin
  on public.badges for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- for all は SELECT も含むため、admin だけは is_active=false のエリアも読める。
-- 一般ユーザー向けの areas_select_active はそのまま残る（ポリシーは OR 結合）
