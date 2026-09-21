-- ============================================
-- reports: 通報
--
--   docs/architecture/data-model/tables.md #reports
--   target_id はポリモーフィック（post/comment/user/cafe）のため FK なし。
--   存在確認・自己通報チェック（user 以外）はアプリ層（createReport）の責務。
-- ============================================

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id),
  target_type       text not null,
  target_id         uuid not null,
  reason            text not null,
  description       text,
  status            text not null default 'pending',
  reviewer_id       uuid references public.profiles (id),
  resolution_notes  text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,

  constraint reports_target_type_check check (target_type in ('post', 'comment', 'user', 'cafe')),
  constraint reports_reason_check check (reason in ('spam', 'harassment', 'minor_risk', 'copyright', 'privacy', 'other')),
  constraint reports_status_check check (status in ('pending', 'reviewing', 'resolved', 'rejected')),
  -- user への自己通報のみ DB で弾く。post/comment/cafe の所有者チェックは
  -- posts/comments のルックアップが要るためアプリ層に見送り（pending-items）
  constraint reports_no_self_report check (not (target_type = 'user' and reporter_id = target_id))
);

comment on table public.reports is
  '通報。target_id はポリモーフィックで FK なし、対象の実在確認はアプリ層の責務';

-- 未処理（pending/reviewing）の間だけ同一対象への重複通報を禁止。resolved/rejected 後の
-- 再通報は許可する（投稿が編集されて再び違反状態になるケースがあるため全期間 UNIQUE にしない）
create unique index reports_open_unique
  on public.reports (reporter_id, target_type, target_id)
  where status in ('pending', 'reviewing');

-- モデレーションキュー（未処理を新しい順）
create index reports_status_created_idx on public.reports (status, created_at);

alter table public.reports enable row level security;

create policy reports_select_own_or_admin
  on public.reports for select
  to authenticated
  using ((select auth.uid()) = reporter_id or public.is_admin());

create policy reports_insert_own
  on public.reports for insert
  to authenticated
  with check ((select auth.uid()) = reporter_id);

create policy reports_update_admin
  on public.reports for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
