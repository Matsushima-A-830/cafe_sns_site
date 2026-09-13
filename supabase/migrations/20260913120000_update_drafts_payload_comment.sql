-- ============================================
-- drafts.payload のコメントを現行スキーマに合わせる
--
-- composer 実装で payload に post_id と visibility が加わった。
--   post_id:    reservePost が確保した予約行。再開時に同じ行を使い回すために必須
--               （無いと予約行が増え、image_paths の postId とも食い違う）
--   visibility: 持たせないと「フォロワーのみ」の下書きが再開時に public へ戻る
--
-- コメントのみの変更で、データもスキーマも変わらない。
--   docs/architecture/data-model/tables.md #drafts
--   docs/product/pending-items.md D17
-- ============================================

comment on column public.drafts.payload is
  '{ v, post_id, post_type, title, body_json, tag_ids, image_paths, cafe_id, visibility }。
   v でスキーマバージョンを管理し、フォーム変更時はクライアント側で
   バージョン不一致の下書きを破棄する（docs/architecture/data-model/tables.md #drafts）';
