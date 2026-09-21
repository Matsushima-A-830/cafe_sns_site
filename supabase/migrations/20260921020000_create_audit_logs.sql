-- ============================================
-- audit_logs: 運営操作の監査記録
--
--   docs/architecture/data-model/tables.md #audit_logs
--   docs/design/screen-flow.md #5-通報ブロックフロー（判定 → audit_logs INSERT）
--
-- INSERT はドキュメント上「システム」とだけ書いていたが、S_ADMIN_REVIEW の判定は
-- admin セッションの Server Action から直接書き込む方式を採る（security definer
-- 関数を介さない）。actor_id = auth.uid() を admin 自身に限定することで、
-- 「システムのみ」の意図（本人によるなりすまし禁止）を RLS で表現する
-- ============================================

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id),
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

comment on table public.audit_logs is
  '運営操作の監査記録。INSERT は admin 本人の Server Action から直接行う（actor_id=auth.uid() をRLSで強制）';

create index audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

create policy audit_logs_select_admin
  on public.audit_logs for select
  to authenticated
  using (public.is_admin());

create policy audit_logs_insert_admin
  on public.audit_logs for insert
  to authenticated
  with check (public.is_admin() and actor_id = (select auth.uid()));

-- UPDATE / DELETE ポリシーは置かない。監査記録は不変
