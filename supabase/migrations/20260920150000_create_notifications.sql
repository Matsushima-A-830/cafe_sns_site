-- ============================================
-- notifications: いいね・コメント・フォローの通知
--
-- type は将来分（badge / owner_verified / regular_awarded / official_post /
-- report_resolved / mention）を含めて9種を CHECK に入れておく。発火元の機能自体が
-- 未実装のため、今回トリガーを書くのは like / comment / follow の3つのみ。
--   docs/architecture/data-model/tables.md #notifications
-- ============================================

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  type         text not null,
  entity_type  text,
  entity_id    uuid,
  payload      jsonb not null default '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),

  constraint notifications_type_check check (type in (
    'like', 'comment', 'follow', 'mention', 'badge',
    'owner_verified', 'regular_awarded', 'official_post', 'report_resolved'
  ))
);

comment on table public.notifications is
  'いいね・コメント・フォロー等の通知。actor_id は退会（profiles削除）で null 化し、
   通知自体は残す（誰からの通知だったか分からなくなっても行自体は消さない）。
   docs/architecture/data-model/tables.md #notifications';

-- 未読一覧の絞り込み・バッジ用カウントに使う
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

-- 通知一覧画面（既読含む）のページング用
create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

-- ============================================
-- RLS
--
-- INSERT ポリシーは置かない。recipient 以外の人物宛ての行を作る必要がある
-- （いいねした本人が投稿者宛ての通知を作る）ため、素の RLS では成立せず、
-- 発火元トリガー側の security definer 関数経由のみに閉じる。
-- ============================================

alter table public.notifications enable row level security;

create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using ((select auth.uid()) = recipient_id);

-- 既読化（read_at の更新）のみ許可。他の列は notifications_guard_update_columns が守る
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

-- read_at 以外の列は既読化 UPDATE で変更させない（comments の
-- guard_comments_moderation_columns と同じ理由・同じ形）
create or replace function public.guard_notifications_update_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recipient_id is distinct from old.recipient_id
     or new.actor_id is distinct from old.actor_id
     or new.type is distinct from old.type
     or new.entity_type is distinct from old.entity_type
     or new.entity_id is distinct from old.entity_id
     or new.payload is distinct from old.payload
     or new.created_at is distinct from old.created_at then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger notifications_guard_update_columns
  before update on public.notifications
  for each row execute function public.guard_notifications_update_columns();

-- ============================================
-- notify_on_like: likes INSERT → 投稿者への通知
--
-- security definer 必須（notifications に INSERT ポリシーが無いため）。
-- 以下の3つを弾かないと壊れる（docs/product/pending-items.md D35 の引き継ぎ）:
--   1. 自己いいね（likes は自己いいねを許可している） → recipient = actor になり自分宛て通知になる
--   2. ブロック相手からのいいね（likes_insert_own はブロックチェックをしていない）
--   3. 受信者が notify_like を false にしている
--
-- auth.uid() は security definer 内でも「実際の呼び出し元」を返す（ロール変更の影響を
-- 受けない）ため、is_blocked_either_way(recipient_id) は「actor と recipient がブロック
-- し合っていないか」を正しく判定できる（likes_insert_own が user_id = auth.uid() を
-- 強制しているため、new.user_id = auth.uid() = actor が常に成立する）
-- ============================================

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
begin
  select author_id into v_recipient_id from public.posts where id = new.post_id;

  if v_recipient_id is null or v_recipient_id = new.user_id then
    return new;
  end if;

  if public.is_blocked_either_way(v_recipient_id) then
    return new;
  end if;

  if not exists (
    select 1 from public.user_settings
    where user_id = v_recipient_id and notify_like = true
  ) then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
  values (v_recipient_id, new.user_id, 'like', 'post', new.post_id);

  return new;
end;
$$;

comment on function public.notify_on_like() is
  '投稿へのいいねを投稿者に通知する。自己いいね・ブロック関係・notify_like=false は
   通知を作らない（作ってから隠すと未読数がずれるため、INSERT前に判定する）';

create trigger likes_notify_on_like
  after insert on public.likes
  for each row execute function public.notify_on_like();

-- ============================================
-- notify_on_follow: follows INSERT → フォローされた人への通知
--
-- follows_no_self_follow の CHECK 制約で自己フォローは既に不可能なので、自己送信の
-- 判定は不要。follows_insert_own は guard_follows_insert_blocked_and_active_followee
-- （20260916120000）でブロック相手へのフォローを既に拒否しているため、ここでの
-- ブロック判定も本来は不要だが、将来そのガードが緩んだ場合の保険として likes と
-- 揃えて明示的にチェックしておく
-- ============================================

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_blocked_either_way(new.followee_id) then
    return new;
  end if;

  if not exists (
    select 1 from public.user_settings
    where user_id = new.followee_id and notify_follow = true
  ) then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
  values (new.followee_id, new.follower_id, 'follow', 'user', new.follower_id);

  return new;
end;
$$;

comment on function public.notify_on_follow() is
  'フォローされたことを通知する。follows_no_self_follow により自己フォローは
   DB制約で既に不可能なので自己送信判定は不要';

create trigger follows_notify_on_follow
  after insert on public.follows
  for each row execute function public.notify_on_follow();

-- ============================================
-- notify_on_comment: comments INSERT → 投稿者 / 親コメント作者への通知
--
-- 宛先は最大2人（投稿者・親コメント作者）。以下を一時テーブル的な配列で一旦
-- 集合として組んでから重複排除・自己送信除外する:
--   - 投稿者 = 親コメント作者 のケース（重複させない）
--   - どちらかが actor 本人のケース（自己コメント、comments は自己コメントを禁止していない）
--   - ブロック関係にある宛先（comments_insert_own はブロックチェックをしていない）
--   - notify_comment=false の宛先
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
    insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
    values (v_post_author_id, new.author_id, 'comment', 'comment', new.id);
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
    insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
    values (v_parent_author_id, new.author_id, 'comment', 'comment', new.id);
  end if;

  return new;
end;
$$;

comment on function public.notify_on_comment() is
  '投稿者と親コメント作者（返信の場合）にコメントを通知する。自己コメント・
   ブロック関係・notify_comment=false・投稿者と親コメント作者が同一人物の場合の
   重複送信をすべて弾く';

create trigger comments_notify_on_comment
  after insert on public.comments
  for each row execute function public.notify_on_comment();
