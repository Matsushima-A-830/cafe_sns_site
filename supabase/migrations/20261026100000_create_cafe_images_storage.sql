-- ============================================
-- cafe-images バケットと storage.objects の RLS
--
-- post-images / avatars と違い、オブジェクトパスの先頭セグメントが所有者
-- （auth.uid()）そのものにならない。cafe-images/{cafe_id}/{uuid}.webp の
-- cafe_id は「更新を許された本人（verified_owner_id）が誰か」を表さないため、
-- (storage.foldername(name))[1] = auth.uid()::text という他バケットの判定式は使えない
-- （他人のオーナーが自分のカフェIDフォルダに書き込める／本人が自分のカフェに書き込めない、の
-- どちらにもなりうる）。is_cafe_owner(p_cafe_id)（20260906140000_create_cafe_business_hours.sql）
-- を使い、パス第1セグメントを cafe_id として渡して判定する
--   docs/architecture/data-model/README.md #ストレージ設計
--   docs/product/pending-items.md D31
-- ============================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cafe-images', 'cafe-images', true, 10485760, array['image/webp'])
on conflict (id) do nothing;

-- ============================================
-- オブジェクトパス規約: cafe-images/{cafe_id}/{uuid}.webp
--   docs/architecture/data-model/README.md #オブジェクトパスの規約
-- ============================================

-- カフェのメイン画像は元々 S_CAFE_DETAIL で誰でも見える公開情報（status='hidden' な
-- カフェ自体は cafes_select_active_* で隠れるため、画像パスを知っていても実害が無い）。
-- post-images の own限定（archived/hidden投稿の画像パス漏洩防止）とは前提が異なるため
-- `using (true)` にする
create policy cafe_images_objects_select_all
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'cafe-images');

-- cafe_business_hours_insert_owner と同じく is_admin() もORで許す（admin がモデレーション目的で
-- 他人のカフェのメイン画像を差し替える場面を想定。cafes_update_owner 自体も admin を例外にしている）
create policy cafe_images_objects_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cafe-images'
    and (
      (public.is_cafe_owner(((storage.foldername(name))[1])::uuid) and (select public.is_active_user()))
      or (select public.is_admin())
    )
  );

create policy cafe_images_objects_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cafe-images'
    and (
      public.is_cafe_owner(((storage.foldername(name))[1])::uuid)
      or (select public.is_admin())
    )
  );

-- UPDATE ポリシーは置かない（署名付きURLは新規発行のみ想定。upsertでの上書きは行わない）
