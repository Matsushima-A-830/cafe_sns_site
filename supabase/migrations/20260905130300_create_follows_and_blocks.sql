-- ============================================
-- follows / blocks: フォローとブロック
--
--   docs/architecture/data-model/tables.md #follows #blocks
-- ============================================

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (follower_id, followee_id),
  constraint follows_no_self_follow check (follower_id <> followee_id)
);

-- フォロワー一覧
create index follows_followee_created_idx on public.follows (followee_id, created_at desc);

alter table public.follows enable row level security;

create policy follows_select_all
  on public.follows for select
  using (true);

create policy follows_insert_own
  on public.follows for insert
  to authenticated
  with check ((select auth.uid()) = follower_id);

create policy follows_delete_own
  on public.follows for delete
  to authenticated
  using ((select auth.uid()) = follower_id);

-- ============================================
-- blocks
-- ============================================

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'ブロック関係。投稿・コメント表示時に RLS で自動除外する';

create index blocks_blocked_id_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- ブロックした本人にしか見せない。ブロックされた側に気づかれるのを避ける
create policy blocks_select_own
  on public.blocks for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

create policy blocks_insert_own
  on public.blocks for insert
  to authenticated
  with check ((select auth.uid()) = blocker_id);

create policy blocks_delete_own
  on public.blocks for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);
