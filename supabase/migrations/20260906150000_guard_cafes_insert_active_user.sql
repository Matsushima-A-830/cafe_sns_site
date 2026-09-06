-- cafes_insert_authenticated に is_active_user() ガードを追加
--
-- CLAUDE.md の必須ルール「未成年アカウントは追加のガード（RLSで
-- profiles.status = 'active' チェック）」を満たしていなかった
-- （pending-items.md D12）。suspended / pending_consent でも
-- 新規カフェを登録できてしまうため、is_active_user() で弾く。

drop policy cafes_insert_authenticated on public.cafes;

create policy cafes_insert_authenticated
  on public.cafes for insert
  to authenticated
  with check ((select auth.uid()) = created_by and (select public.is_active_user()));
