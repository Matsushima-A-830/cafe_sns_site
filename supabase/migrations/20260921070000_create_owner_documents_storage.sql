-- ============================================
-- owner-documents バケットと storage.objects の RLS
--
--   docs/architecture/data-model/README.md #ストレージ設計
--   docs/architecture/data-model/README.md #owner-documents-は予約行方式を使わない
--
-- post-images と違い private バケット。書類には法人登記簿・開業届など画像以外
-- （PDF）もありえるため allowed_mime_types に application/pdf を含める。
-- ============================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'owner-documents',
  'owner-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- ============================================
-- オブジェクトパス規約: owner-documents/{user_id}/{verification_id}/{uuid}.{ext}
--
-- verification_id は DB 行の存在確認をせず、クライアントが crypto.randomUUID() で
-- 生成してパス命名にのみ使う（cafe_owner_verifications の document_urls CHECK 制約
-- のため、posts の予約行パターンは使えない）。認可はパス第1セグメント（user_id）
-- のみで担保する。post_images_objects_* と同型だが、非公開バケットのため
-- SELECT も本人 + admin 限定にする点が異なる
-- ============================================

create policy owner_documents_objects_select_own_or_admin
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'owner-documents'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

create policy owner_documents_objects_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'owner-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );

create policy owner_documents_objects_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'owner-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- UPDATE ポリシーは置かない（署名付きURLは新規発行のみ想定。upsertでの上書きは行わない）
