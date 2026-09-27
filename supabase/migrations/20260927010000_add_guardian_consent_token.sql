-- ============================================
-- 保護者同意のワンタイムトークン（B3）
--
-- profiles_select_all は using(true) で行も列も絞らない（guardian_email が既に同じ構造で
-- アプリ層のカラム許可リストに依存している。lib/profiles/public-profile.ts 参照）。
-- 列単位のGRANTで塞ぐ案も検討したが、Postgresは「テーブル単位のSELECT権限」が既にある
-- ロールに対して列単位のREVOKEをしても無効（テーブル権限がすべての列を暗黙に許可するため）。
-- anon/authenticated からテーブル単位のSELECTを剥がして列を選び直すのは profiles 全体の
-- 権限モデルを作り直す規模の変更になり、このPRの範囲を超える。
--
-- 代わりに、生のトークン（メールのリンクに載る値）はDBに保存せず、SHA-256ハッシュだけを
-- 保存する。RLSが破られて guardian_consent_token_hash が読まれても、そこから有効な
-- p_token を逆算することは事実上不可能（256bitランダム値の原像計算）なので、
-- 「知っていれば認可が成立する」秘密がテーブルの外（メール本文）にしか存在しなくなる
--   docs/product/pending-items.md B3
-- ============================================

alter table public.profiles
  add column guardian_consent_token_hash        text,
  add column guardian_consent_token_expires_at  timestamptz;

-- 未使用トークンだけが対象なので使用済み(null)は重複してよい → 部分ユニークインデックス
create unique index profiles_guardian_consent_token_hash_idx
  on public.profiles (guardian_consent_token_hash)
  where guardian_consent_token_hash is not null;

comment on column public.profiles.guardian_consent_token_hash is
  '保護者同意リンクのワンタイムトークンのSHA-256ハッシュ（hex）。生の値はメールにのみ存在し、DBには残さない。承認後はnullに戻す（再利用防止）';
comment on column public.profiles.guardian_consent_token_expires_at is
  'guardian_consent_token_hash の有効期限。切れたトークンは approve_guardian_consent が拒否する';

-- 保護者は未ログインでリンクをクリックする（anon）。guard_privileged_profile_columns
-- トリガーは auth.uid() が null のリクエストを素通りさせる設計になっており
-- （20260905130000_create_profiles.sql 参照）、このRPCはその前提の上に成立している。
-- SECURITY DEFINER が RLS 自体もバイパスするため、認可はこの関数内の
-- ハッシュ一致・有効期限・status='pending_consent' の3条件だけが唯一の防御線になる。
-- p_token は生の値（アプリから渡される）で、ここでハッシュ化してから照合する
create or replace function public.approve_guardian_consent(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_id uuid;
  v_token_hash text;
begin
  if p_token is null or p_token = '' then
    return false;
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  update public.profiles
  set status = 'active',
      guardian_consent_at = now(),
      guardian_consent_token_hash = null,
      guardian_consent_token_expires_at = null
  where guardian_consent_token_hash = v_token_hash
    and guardian_consent_token_expires_at > now()
    and status = 'pending_consent'
  returning id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

comment on function public.approve_guardian_consent(text) is
  '保護者同意リンクの生トークンをハッシュ化して検証し、成功したら status を active にする。anon から呼ばれる唯一のprofiles書き込みRPC';

revoke execute on function public.approve_guardian_consent(text) from public;
grant execute on function public.approve_guardian_consent(text) to anon, authenticated;
