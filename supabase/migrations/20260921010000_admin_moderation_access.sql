-- ============================================
-- 通報レビュー（S_ADMIN_REVIEW）用の admin バイパス
--
-- posts_select / comments_select_visible は非公開・非表示・論理削除済みの行を
-- 隠す設計だが、通報対象こそまさにそういう行であることが多い。admin だけが
-- status/deleted_at を問わず読める permissive policy を追加する
-- （cafes_select_active_authenticated と同じ形。既存ポリシーは変更しない）。
--
-- 併せて、admin が「投稿を非表示にする」「コメントを削除する」判定を実行できるよう
-- UPDATE ポリシーも追加する。comments 側は guard_comments_moderation_columns が
-- deleted_at の変更を作者本人・投稿主にしか許していないため、is_admin() を追記する
-- ============================================

create policy posts_select_admin
  on public.posts for select
  to authenticated
  using (public.is_admin());

create policy posts_update_admin
  on public.posts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy comments_select_admin
  on public.comments for select
  to authenticated
  using (public.is_admin());

create policy comments_update_admin
  on public.comments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.guard_comments_moderation_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() が無いのは service_role か直接接続（seed・運用スクリプト）
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.post_id is distinct from old.post_id
     or new.author_id is distinct from old.author_id
     or new.parent_id is distinct from old.parent_id
     or new.is_official is distinct from old.is_official
     or new.created_at is distinct from old.created_at then
    raise exception 'FORBIDDEN';
  end if;

  if new.body is distinct from old.body
     and (select auth.uid()) is distinct from old.author_id then
    raise exception 'FORBIDDEN';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if (select auth.uid()) is distinct from old.author_id
       and not public.is_post_author(old.post_id)
       and not public.is_admin() then
      raise exception 'FORBIDDEN';
    end if;

    if new.deleted_at is not null
       and old.parent_id is null
       and (select auth.uid()) = old.author_id
       and not public.is_post_author(old.post_id)
       and public.comment_has_live_replies(old.id) then
      raise exception 'COMMENT_HAS_REPLIES';
    end if;
  end if;

  return new;
end;
$$;
