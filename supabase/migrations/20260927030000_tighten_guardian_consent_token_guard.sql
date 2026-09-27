-- ============================================
-- guardian_consent_token_* 列の書き込みガードから is_admin() バイパスを外す（/code-review で発覚）
--
-- 20260927020000 のコメントは「この列への書き込みは auth.uid() が null（= service_role）の
-- 場合だけを許す形に揃える」と書いていたが、実装は role/status/username と同じ
-- `and not public.is_admin()` を流用したため、認証済みadmin自身のセッションからも
-- 書き込めてしまっていた（コメントと実装が矛盾）。正規の再発行経路
-- （reissueGuardianConsentToken, app/_actions/auth.ts）は createAdminClient() 経由に
-- 限定する設計のため、admin セッションでの直接書き込みを許す理由が無い。
-- コメント通りの制約（auth.uid() が null の場合のみ許可）に締める。
--
-- 注意: この関数は複数マイグレーションに分散して create or replace されている。
-- 変更前に必ず `grep -rl 'guard_privileged_profile_columns' supabase/migrations/` で
-- 最新の本体を確認してから差分を取ること（role/status/username チェックを消さないため）
--   supabase/migrations/20260905130000_create_profiles.sql
--   supabase/migrations/20260923140000_guard_profile_username.sql
--   supabase/migrations/20260927020000_guard_guardian_consent_token_columns.sql
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
      or new.guardian_consent_token_expires_at is distinct from old.guardian_consent_token_expires_at then
    raise exception 'FORBIDDEN';
  end if;

  return new;
end;
$$;
