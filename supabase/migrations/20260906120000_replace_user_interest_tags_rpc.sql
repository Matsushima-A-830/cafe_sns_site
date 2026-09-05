-- ============================================
-- replace_user_interest_tags: 気分タグの入れ替えをアトミックに行う
--
-- app/_actions/onboarding.ts の submitInterests は以前 delete → insert を
-- 2回の別々の PostgREST 呼び出しで行っていた。insert 側だけ失敗すると
-- （enforce_user_interest_tags_rules の TAG_CATEGORY_NOT_ALLOWED や通信断等）
-- delete だけが確定し、ユーザーのタグが無言でゼロ件になってしまう。
-- 1つの関数呼び出しにまとめることで、失敗時は暗黙のトランザクションごと
-- ロールバックされ「変わらないか、両方成功するか」のどちらかになる。
--
-- security invoker（既定）のまま呼ぶ。RLS の
-- user_interest_tags_delete_own / user_interest_tags_insert_own が
-- 呼び出し元 (auth.uid()) に対してそのまま効く
-- ============================================

create or replace function public.replace_user_interest_tags(p_tag_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_tag_ids is null or array_length(p_tag_ids, 1) is null then
    raise exception 'INTEREST_TAGS_EMPTY';
  end if;

  delete from public.user_interest_tags where user_id = (select auth.uid());

  -- distinct: 呼び出し側で重複IDが混ざると PK 違反(23505)で丸ごとロールバックし、
  -- ユーザーは古いタグのままエラーだけを見ることになる
  insert into public.user_interest_tags (user_id, tag_id)
  select distinct (select auth.uid()), tag_id from unnest(p_tag_ids) as tag_id;
end;
$$;

comment on function public.replace_user_interest_tags(uuid[]) is
  '気分タグ（1〜5個、occasion/mood）を丸ごと入れ替える。delete/insert を1呼び出しに閉じ込め、片方だけの成功を防ぐ';

grant execute on function public.replace_user_interest_tags(uuid[]) to authenticated, service_role;
revoke execute on function public.replace_user_interest_tags(uuid[]) from public;
