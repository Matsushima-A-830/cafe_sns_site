-- follows_insert_own に「相手」側のガードを追加
--
-- これまで follows_insert_own が見ていたのは「本人であること」（auth.uid() = follower_id）と
-- 「自分が active であること」（is_active_user()）だけで、followee 側は無防備だった。
-- そのため 1) ブロックしている / されている相手をフォローできる
--         2) suspended / deleted / pending_consent の相手をフォローできる
-- が成立していた（pending-items.md D29）。認可はアプリ層ではなく RLS に持たせる方針
-- （CLAUDE.md「RLSに認可を委譲」）なので、ポリシー側で弾く。
--
-- 自己フォローは follows_no_self_follow の CHECK 制約が引き続き担う。
-- profiles の EXISTS は profiles_select_all が using (true) なので RLS 越しでも成立する。

alter policy follows_insert_own
  on public.follows
  with check (
    (select auth.uid()) = follower_id
    and (select public.is_active_user())
    and not public.is_blocked_either_way(followee_id)
    and exists (
      select 1 from public.profiles p
      where p.id = followee_id and p.status = 'active'
    )
  );
