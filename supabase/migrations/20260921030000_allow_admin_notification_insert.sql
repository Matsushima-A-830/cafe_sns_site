-- ============================================
-- notifications: admin による report_resolved 通知の直接 INSERT を許可
--
-- 既存の notifications は INSERT ポリシーを一切置かず、like/comment/follow は
-- すべて security definer トリガー経由に閉じている（ブロック関係・通知設定の
-- チェックが要るため）。通報対応の通知にはそのどちらも関係なく、admin の
-- Server Action から直接 INSERT する方式（audit_logs と同じ）を採るため、
-- is_admin() を条件にした INSERT ポリシーを追加する。
--
-- type を 'report_resolved' 限定にする: is_admin() だけだと admin セッションから
-- type='like'/'comment' 等の行も直接 INSERT でき、notify_on_like 等のトリガーが
-- 強制する自己通知・ブロック関係・notify設定offのチェックを丸ごとバイパスできてしまう
--   docs/architecture/data-model/tables.md #notifications
--   docs/design/screen-flow.md #5-通報ブロックフロー
-- ============================================

create policy notifications_insert_admin
  on public.notifications for insert
  to authenticated
  with check (public.is_admin() and type = 'report_resolved');
