-- ============================================
-- is_profile_active: 指定ユーザーの profiles.status が active か
--
-- is_active_user()（20260906140000）は auth.uid() 固定で「呼び出し元本人」しか
-- 判定できない。posts_select で見るべきは投稿者（posts.author_id）の status
-- なので、is_blocked_either_way と同じく引数を取る関数が必要。
-- profiles_select_all が using (true) で全行読めるため、blocks の bidirectional
-- 判定と異なり RLS をバイパスする理由が無く security definer にはしない
--（docs/architecture/data-model/tables.md #posts）
-- ============================================

create or replace function public.is_profile_active(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and status = 'active'
  );
$$;

comment on function public.is_profile_active(uuid) is
  '指定ユーザーの profiles.status が active か。停止・削除された投稿者の投稿を
   posts_select から除外するために使う（D29）';

revoke execute on function public.is_profile_active(uuid) from public;
grant execute on function public.is_profile_active(uuid) to anon, authenticated;

-- ============================================
-- posts_select: 投稿者の profiles.status が active であることも要求する（D29）
--
-- posts_select_own（20260910120000）は変更しない。posts_select_own は
-- 「作者本人は自分の投稿を status を問わず読める」ための別の permissive
-- policy で、ここに author status 条件を足すと停止された本人が自分の投稿を
-- UPDATE/DELETE できなくなる（20260910120000 が直した過去のバグの再発）。
-- ============================================

drop policy posts_select on public.posts;

create policy posts_select
  on public.posts for select
  to anon, authenticated
  using (
    status = 'published'
    and deleted_at is null
    and public.is_profile_active(posts.author_id)
    and (
      visibility = 'public'
      or author_id = (select auth.uid())
      or exists (
        select 1 from public.follows f
        where f.followee_id = posts.author_id and f.follower_id = (select auth.uid())
      )
    )
    and not public.is_blocked_either_way(posts.author_id)
  );
