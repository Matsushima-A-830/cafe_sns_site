-- ============================================
-- post-images バケットと storage.objects の RLS
--
-- バケット定義を config.toml ではなくマイグレーションに置く理由: ローカルは
-- config.toml の [storage.buckets.*] でも作れるが、本番Cloudには反映されない。
-- storage.buckets は単なるテーブルなので、マイグレーションSQLに一本化して
-- ローカル・Cloud両方を同じ経路（supabase db reset / db push）でカバーする。
--   docs/architecture/data-model/README.md #ストレージ設計
--   docs/architecture/routing.md POST /api/uploads/sign
-- ============================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 10485760, array['image/webp'])
on conflict (id) do nothing;

-- ============================================
-- オブジェクトパス規約: post-images/{author_id}/{post_id}/{uuid}.webp
-- 先頭セグメント = 所有者ID を書き込み権限の担保にする
--   docs/architecture/data-model/README.md #オブジェクトパスの規約
-- ============================================

create policy post_images_objects_select_public
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'post-images');

-- CLAUDE.md「未成年アカウントは追加のガード」を Storage 側にも適用するため
-- is_active_user() を併用する（post_images テーブルの INSERT ポリシーと同じ理由）
create policy post_images_objects_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );

create policy post_images_objects_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- UPDATE ポリシーは置かない（署名付きURLは新規発行のみ想定。upsertでの上書きは行わない）
