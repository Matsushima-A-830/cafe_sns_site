-- ============================================
-- custom_access_token_hook: FOUND を SELECT INTO 直後に退避する
--
-- 「profiles 行のない新規ユーザーでもトークンを取得できる」という不変条件は
-- FOUND の値に依存している。SELECT INTO と IF NOT FOUND の間に別の
-- SELECT/PERFORM/ループが挟まると FOUND が上書きされ、気づかれないまま
-- 全ユーザーのログインが壊れうる。plpgsql の代入自体は FOUND を変えないため
-- 現状の実装は正しいが、将来の変更に対して脆いのでその場で boolean に固定する
-- ============================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  p record;
  base_app_metadata jsonb;
  profile_found boolean;
begin
  select role, status, (onboarded_at is not null) as onboarded
    into p
  from public.profiles
  where id = (event->>'user_id')::uuid;
  profile_found := found;

  base_app_metadata := coalesce(event->'claims'->'app_metadata', '{}'::jsonb)
    - 'birth_date' - 'age_category' - 'guardian_email';

  -- サインアップ直後（生年月日の入力前）は profiles 行がまだ無い。
  -- ここで落とすとログインそのものができなくなるので素通りさせる
  if not profile_found then
    return jsonb_set(event, '{claims,app_metadata}', base_app_metadata);
  end if;

  return jsonb_set(event, '{claims,app_metadata}', base_app_metadata || to_jsonb(p));
end;
$$;
