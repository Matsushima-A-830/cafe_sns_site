-- ============================================
-- guardian_consent_token_issued_at も guard_privileged_profile_columns の対象にする
--
-- 20260927040000 で追加した列。他の保護者同意トークン列（hash/expires_at）と同じ扱い
-- （service_role 限定、is_admin() バイパスなし）にしないと、pending_consent の本人が
-- profiles_update_self 経由でこの列を書き換え、クールダウンを自作自演でリセットできてしまう。
--
-- 注意: この関数は複数マイグレーションに分散して create or replace されている。
-- 変更前に必ず `grep -rl 'guard_privileged_profile_columns' supabase/migrations/` で
-- 最新の本体を確認してから差分を取ること（role/status/username チェックを消さないため）
--   supabase/migrations/20260905130000_create_profiles.sql
--   supabase/migrations/20260923140000_guard_profile_username.sql
--   supabase/migrations/20260927020000_guard_guardian_consent_token_columns.sql
--   supabase/migrations/20260927030000_tighten_guardian_consent_token_guard.sql
-- ============================================

create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() が無いのは service_role か直接接続（seed・運用スクリプト）。
  -- ここを通さないと A9 の本番手順「最初の1人を service_role で昇格する」が塞がる。
  -- anon も uid が無いが、profiles の UPDATE ポリシーが authenticated 限定なので届かない
  if (select auth.uid()) is null then
    return new;
  end if;

  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if new.username is distinct from old.username then
    raise exception 'FORBIDDEN';
  end if;

  -- is_admin() バイパスを与えない。正規の書き込みは常に service_role（createAdminClient()）経由
  if new.guardian_consent_token_hash is distinct from old.guardian_consent_token_hash
      or new.guardian_consent_token_expires_at is distinct from old.guardian_consent_token_expires_at
      or new.guardian_consent_token_issued_at is distinct from old.guardian_consent_token_issued_at then
    raise exception 'FORBIDDEN';
  end if;

  return new;
end;
$$;
