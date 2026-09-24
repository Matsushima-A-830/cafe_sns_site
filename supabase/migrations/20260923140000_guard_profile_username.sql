-- username も role/status と同じく本人に変更させない（D46）。
-- 変更不可は Server Action のスキーマ設計だけで担保しており、
-- PostgREST 経由の直接更新を RLS/トリガーが防げていなかった。
-- admin 例外は設けない（ワイヤーに例外の記述が無く、管理画面にも username 変更UIが存在しないため）
create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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

  return new;
end;
$$;
