-- ============================================
-- S_ADMIN_OWNER_REVIEW: オーナー認証審査の承認/却下通知を admin から直接 INSERT できるようにする
--
--   docs/design/screen-flow.md #6-カフェ経営者フロー
--   docs/architecture/data-model/tables.md #notifications
--
-- 却下用の type を新設する: owner_verified は承認専用のまま残し、却下は
-- owner_verification_rejected に分ける。report_resolved のような単一type流用は
-- 「承認/却下どちらか payload を見ないと分からない」UXになるため避ける
-- ============================================

alter table public.notifications
  drop constraint notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'like', 'comment', 'follow', 'mention', 'badge',
    'owner_verified', 'owner_verification_rejected',
    'regular_awarded', 'official_post', 'report_resolved'
  ));

-- notifications_insert_admin（20260921030000）は type = 'report_resolved' 固定だった。
-- 承認/却下の通知も admin セッションから直接 INSERT する（audit_logs と同じ方式）ため、
-- 許可する type を広げる
drop policy notifications_insert_admin on public.notifications;

create policy notifications_insert_admin
  on public.notifications for insert
  to authenticated
  with check (
    public.is_admin()
    and type in ('report_resolved', 'owner_verified', 'owner_verification_rejected')
  );
