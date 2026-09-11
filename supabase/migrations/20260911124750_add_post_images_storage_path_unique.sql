-- ============================================
-- post_images.storage_path に一意制約を追加
--
-- 二重送信（同じ postId への createPost の再送・ダブルタップ）で post_images の
-- insert が並列に走ると、一意制約が無いままでは同じ storage_path の行が
-- エラーなしで重複登録されてしまう（10枚以内なら気づかれず、10枚を超えると
-- POST_IMAGES_LIMIT_EXCEEDED で正常なリクエスト側までロールバックされる）。
-- post_tags は (post_id, tag_id) の主キーで既にこの種の二重送信を 23505 として
-- 検出できているのと同じ形に揃える
--   docs/product/pending-items.md D17
--   app/_actions/posts.ts isUniqueViolation
-- ============================================

alter table public.post_images
  add constraint post_images_storage_path_key unique (storage_path);
