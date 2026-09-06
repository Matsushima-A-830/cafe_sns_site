-- follows / user_interest_tags の INSERT ポリシーに is_active_user() ガードを追加
--
-- CLAUDE.md の必須ルール「未成年アカウントは追加のガード（RLSで
-- profiles.status = 'active' チェック）」を follows_insert_own /
-- user_interest_tags_insert_own が満たしていなかった（pending-items.md D13）。
-- suspended / pending_consent でもフォロー・興味タグ登録ができてしまうため、
-- is_active_user() で弾く。
--
-- blocks_insert_own は対象外（被害者保護のため suspended 等でもブロック
-- 手段を残す方針。pending-items.md D13 参照）。

alter policy follows_insert_own
  on public.follows
  with check ((select auth.uid()) = follower_id and (select public.is_active_user()));

alter policy user_interest_tags_insert_own
  on public.user_interest_tags
  with check ((select auth.uid()) = user_id and (select public.is_active_user()));
