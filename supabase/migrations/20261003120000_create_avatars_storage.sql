-- ============================================
-- avatars バケットと storage.objects の RLS
--
-- post-images と同型（20260908090000_create_post_images_storage.sql）。
-- バケット定義をマイグレーションに置く理由も同じ: config.toml の
-- [storage.buckets.*] はローカル専用で本番Cloudに反映されないため
--   docs/architecture/data-model/README.md #ストレージ設計
--   docs/product/pending-items.md D45
-- ============================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- ============================================
-- オブジェクトパス規約: avatars/{user_id}/{uuid}.webp
-- 先頭セグメント = 所有者ID を書き込み権限の担保にする
--   docs/architecture/data-model/README.md #オブジェクトパスの規約
-- ============================================

-- post_images_objects_select_own と同じ理由で `using (true)` にしない。
-- 公開URL（/object/public/...）経由の読み取りは RLS を通らないため実運用には影響しない
create policy avatars_objects_select_own
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- CLAUDE.md「未成年アカウントは追加のガード」を Storage 側にも適用する
create policy avatars_objects_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );

create policy avatars_objects_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- UPDATE ポリシーは置かない（署名付きURLは新規発行のみ想定。upsertでの上書きは行わない）
