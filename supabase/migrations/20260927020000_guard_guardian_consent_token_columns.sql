-- ============================================
-- 保護者同意トークン列も guard_privileged_profile_columns の対象にする（/code-review で発覚）
--
-- profiles_update_self は auth.uid() = id なら本人が自由に列を書ける。
-- role/status/username しか守っていなかったため、pending_consent の本人が
-- guardian_consent_token_hash / guardian_consent_token_expires_at を自分で
-- 好きな値に書き換え、その生の値を GET /api/consent/confirm に渡せば
-- 保護者を一切介さず自己承認できてしまっていた（メール送信もRLSも経由しない）。
--
-- 正規の再発行（resendGuardianConsentEmail/updateGuardianEmail）は
-- createAdminClient() 経由に変更し、この列への書き込みは
-- 「auth.uid() が null（= service_role）」の場合だけを許す形に揃える。
--
-- 注意: この関数は 20260923140000_guard_profile_username.sql で username チェックが
-- 追加されている。CREATE OR REPLACE で丸ごと差し替えるため、そちらの内容も引き継ぐ
-- （うっかり古い本体で上書きすると username 変更禁止が消える — 実際に一度やってしまい
-- 統合テストで検出した）
--   supabase/migrations/20260927010000_add_guardian_consent_token.sql
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

  if (new.guardian_consent_token_hash is distinct from old.guardian_consent_token_hash
      or new.guardian_consent_token_expires_at is distinct from old.guardian_consent_token_expires_at)
     and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  return new;
end;
$$;
