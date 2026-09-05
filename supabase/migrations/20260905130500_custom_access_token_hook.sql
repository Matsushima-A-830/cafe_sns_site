-- ============================================
-- custom_access_token_hook: JWT に role / status / onboarded を載せる
--
-- middleware は Edge Runtime で動くため DB を引けない。誘導の判定は
-- このクレイムだけで行う（認可の最終防衛線はあくまで RLS）。
--   docs/architecture/routing.md #カスタムクレイムの同期方式
--
-- ⚠️ config.toml の [auth.hook.custom_access_token] を有効化するのは
--    この関数が存在してから。無い状態で有効化するとトークン発行自体が失敗し、
--    ログインできなくなる。だから同じマイグレーションと同じ PR で入れる。
-- ============================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  p record;
begin
  select role, status, (onboarded_at is not null) as onboarded
    into p
  from public.profiles
  where id = (event->>'user_id')::uuid;

  -- サインアップ直後（生年月日の入力前）は profiles 行がまだ無い。
  -- ここで落とすとログインそのものができなくなるので素通りさせる
  if not found then
    return event;
  end if;

  return jsonb_set(
    event,
    '{claims,app_metadata}',
    coalesce(event->'claims'->'app_metadata', '{}'::jsonb) || to_jsonb(p)
  );
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'アクセストークン発行時に profiles の現在値を app_metadata クレイムへ差し込む';

-- Auth はこの専用ロールで関数を呼ぶ
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- フック関数は RLS を経由せず profiles を読む必要がある
grant usage on schema public to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;

create policy profiles_select_auth_admin
  on public.profiles for select
  to supabase_auth_admin
  using (true);
