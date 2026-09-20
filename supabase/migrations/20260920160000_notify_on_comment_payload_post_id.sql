-- ============================================
-- notify_on_comment: payload に postId を積む
--
-- S_NOTIFICATIONS の一覧UIはコメント通知から投稿詳細（/posts/[id]）へリンクする必要が
-- あるが、entity_type='comment' / entity_id=コメントid だけでは post_id が引けない。
-- comments トリガーの NEW 行には post_id が既にあるので、追加の JOIN 無しで payload に
-- 積める。create or replace で既存関数を差し替える（20260920150000 からの追記）
-- ============================================

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_author_id uuid;
  v_parent_author_id uuid;
begin
  select author_id into v_post_author_id from public.posts where id = new.post_id;

  if new.parent_id is not null then
    select author_id into v_parent_author_id from public.comments where id = new.parent_id;
  end if;

  -- 投稿者への通知
  if v_post_author_id is not null
     and v_post_author_id <> new.author_id
     and not public.is_blocked_either_way(v_post_author_id)
     and exists (
       select 1 from public.user_settings
       where user_id = v_post_author_id and notify_comment = true
     )
  then
    insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id, payload)
    values (
      v_post_author_id, new.author_id, 'comment', 'comment', new.id,
      jsonb_build_object('postId', new.post_id)
    );
  end if;

  -- 親コメント作者への通知（投稿者と同一人物なら二重送信しない）
  if v_parent_author_id is not null
     and v_parent_author_id <> new.author_id
     and v_parent_author_id is distinct from v_post_author_id
     and not public.is_blocked_either_way(v_parent_author_id)
     and exists (
       select 1 from public.user_settings
       where user_id = v_parent_author_id and notify_comment = true
     )
  then
    insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id, payload)
    values (
      v_parent_author_id, new.author_id, 'comment', 'comment', new.id,
      jsonb_build_object('postId', new.post_id)
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_on_comment() is
  '投稿者と親コメント作者（返信の場合）にコメントを通知する。自己コメント・
   ブロック関係・notify_comment=false・投稿者と親コメント作者が同一人物の場合の
   重複送信をすべて弾く。payload.postId は一覧UIが /posts/[id] へリンクするために積む';
