-- cafes_update_owner に「登録者本人による未認証カフェの編集」を追加
--
-- B8（pending-items.md）決定: 登録直後はまだ verified_owner_id が
-- 付与されていないため、誤字修正のたびに admin 対応が必要になっていた
-- （S_CAFE_NEW 実装時に運用コストが見合わないと判断）。
-- created_by = auth.uid() かつ verified_owner_id is null の間だけ、
-- 登録者本人にも UPDATE を許可する。verified_owner_id が付与された
-- 後（オーナー認証完了後）は、従来どおり verified_owner_id 一致者のみ
-- 編集可能（本人が編集できたはずの created_by 経路も、オーナー確定と
-- 同時に閉じる想定）。

alter policy cafes_update_owner
  on public.cafes
  using (
    (verified_owner_id = (select auth.uid()) and (select public.is_active_user()))
    or (
      created_by = (select auth.uid())
      and verified_owner_id is null
      and (select public.is_active_user())
    )
    or (select public.is_admin())
  )
  with check (
    (verified_owner_id = (select auth.uid()) and (select public.is_active_user()))
    or (
      created_by = (select auth.uid())
      and verified_owner_id is null
      and (select public.is_active_user())
    )
    or (select public.is_admin())
  );
