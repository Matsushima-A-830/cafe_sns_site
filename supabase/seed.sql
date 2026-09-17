-- ============================================
-- ローカル開発専用の初期データ（pnpm db:reset で投入）
--
-- **マスタデータ（areas / tags / badges）はここには置かない。**
-- 本番にも必要なデータなので、承認ゲート付きの `supabase db push` に乗る
-- マイグレーション側（20260905120400_seed_master_data.sql）が正。
-- このファイルは `supabase db reset` でしか実行されず、本番には届かない。
--
-- ここに置くのは「ローカル / Preview だけで欲しいもの」に限る。
-- ============================================

-- ============================================
-- 開発用 admin（pending-items A9）
--
-- profiles.role の変更は admin 限定なので、誰も最初の admin になれない。
-- ローカルはこの seed で作る。**本番にはこの経路が無い**ので、
-- 最初の1人は service_role で手動昇格する（手順は deployment.md 参照）。
--
--   ログイン: admin@example.test / password123
--   ローカル専用。本番には存在しないし、作ってはいけない。
-- ============================================

do $$
declare
  admin_id uuid := '00000000-0000-4000-8000-000000000001';
begin
  -- トークン列を空文字で埋めるのは GoTrue の都合。NULL のままだと
  -- 「converting NULL to string is unsupported」でログイン自体が 500 になる
  -- （列は nullable だが、GoTrue 側が string として読む）
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, email_change, phone_change,
    phone_change_token, reauthentication_token
  ) values (
    admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin@example.test', extensions.crypt('password123', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  )
  on conflict (id) do nothing;

  -- GoTrue はパスワードログイン時に identities を引く
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, created_at, updated_at
  ) values (
    gen_random_uuid(), admin_id, admin_id::text, 'email',
    jsonb_build_object('sub', admin_id::text, 'email', 'admin@example.test'),
    now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  insert into public.profiles (id, username, display_name, birth_date, role, onboarded_at)
  values (admin_id, 'admin', '開発用管理者', '1990-01-01', 'admin', now())
  on conflict (id) do update set role = 'admin';
end $$;
