-- ============================================
-- 保護者同意トークンの発行時刻を専用列で持つ（/code-review で発覚）
--
-- 従来 assertPendingConsent は「発行時刻 = guardian_consent_token_expires_at -
-- GUARDIAN_CONSENT_TOKEN_TTL_MS」で逆算していたが、これは2つの問題を持っていた:
--
-- 1. TTL定数が将来変わると、既発行トークンの発行時刻の逆算がすべてズレる
--    （lib/utils/guardian-consent-token.ts の定数変更が過去データの解釈まで変えてしまう）
-- 2. クールダウン判定（assertPendingConsent、通常クライアントのSELECT）と
--    トークン発行（reissueGuardianConsentToken、admin クライアントのUPDATE）が
--    別々のDB往復のため原子性が無く、ほぼ同時に2回リクエストすると両方が
--    クールダウンを通過してしまい、保護者に2通のメールが届きうる
--
-- 発行時刻を独立した列として持ち、次の20260927050000でこの列を
-- 「クールダウンを満たす場合のみ更新できる」単一の原子的UPDATEの対象にすることで
-- 両方を解消する。RLS上の性質は guardian_consent_token_expires_at と同じ
-- （profiles_select_all が using(true) のため既に公開読み取り可能）ので、
-- 新たなプライバシー面の露出は増えない
--   docs/product/pending-items.md B3
-- ============================================

alter table public.profiles
  add column guardian_consent_token_issued_at timestamptz;

comment on column public.profiles.guardian_consent_token_issued_at is
  '保護者同意トークンの発行時刻（クールダウン判定専用）。有効期限は
   guardian_consent_token_expires_at 側で別管理するため、このタイムスタンプは
   「次にいつ再発行できるか」だけに使う。書き込みは service_role 限定
   （guard_privileged_profile_columns、20260927050000）';
