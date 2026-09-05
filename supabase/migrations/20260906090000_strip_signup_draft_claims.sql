-- ============================================
-- custom_access_token_hook: サインアップ下書きの一時項目を JWT から除去
--
-- app/_actions/auth.ts は生年月日・年齢区分・保護者メールを
-- auth.users.raw_app_meta_data に一時保持する（本人が書き換えられない
-- app_metadata を使うことで年齢詐称を防ぐ設計）。
-- GoTrue はトークン発行時に raw_app_meta_data をまるごと event.claims.app_metadata
-- に積むため、何もしなければこれらの値がアクセストークン（ブラウザから読める cookie）
-- に載り、アカウントの生涯にわたって全リクエストで送信され続けてしまう。
-- 該当キーだけを明示的に取り除いてから role/status/onboarded をマージする。
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
begin
  select role, status, (onboarded_at is not null) as onboarded
    into p
  from public.profiles
  where id = (event->>'user_id')::uuid;

  base_app_metadata := coalesce(event->'claims'->'app_metadata', '{}'::jsonb)
    - 'birth_date' - 'age_category' - 'guardian_email';

  -- サインアップ直後（生年月日の入力前）は profiles 行がまだ無い。
  -- ここで落とすとログインそのものができなくなるので素通りさせる
  if not found then
    return jsonb_set(event, '{claims,app_metadata}', base_app_metadata);
  end if;

  return jsonb_set(event, '{claims,app_metadata}', base_app_metadata || to_jsonb(p));
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'アクセストークン発行時に profiles の現在値を app_metadata クレイムへ差し込む。サインアップ下書き用の一時項目（birth_date/age_category/guardian_email）は除去する';
