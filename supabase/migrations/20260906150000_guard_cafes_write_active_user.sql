-- cafes の書き込みポリシーに is_active_user() ガードを追加
--
-- CLAUDE.md の必須ルール「未成年アカウントは追加のガード（RLSで
-- profiles.status = 'active' チェック）」を満たしていなかった
-- （pending-items.md D12）。suspended / pending_consent でも
-- 新規登録・更新ができてしまうため、is_active_user() で弾く。
-- admin は cafe_business_hours 等の既存ポリシーと同様 active チェックを
-- バイパスできる据え置きとする。

alter policy cafes_insert_authenticated
  on public.cafes
  with check ((select auth.uid()) = created_by and (select public.is_active_user()));

alter policy cafes_update_owner
  on public.cafes
  using (
    (verified_owner_id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.is_admin())
  )
  with check (
    (verified_owner_id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.is_admin())
  );
