-- ============================================
-- posts_select_own: 作者本人は自分の posts を status を問わず読める
--
-- 統合テストで判明: PostgreSQL の RLS は UPDATE/DELETE の対象行を選ぶ際にも
-- SELECT ポリシーの USING を適用する。既存の posts_select は
-- status='published' を必須にしているため、author_id が一致していても
-- status='hidden'/'archived' の行は UPDATE の対象行として一切見つからず、
-- app/_actions/posts.ts createPost の「hidden で作成 → published へ更新」の
-- 最後の UPDATE が対象0件のまま成功扱いになり、投稿が永久に hidden のまま
-- 公開されないという致命的なバグを引き起こしていた
--（tests/integration/posts-create-flow.test.ts で検証）。
--
-- post_images/post_tags は is_post_author()（security definer）で同じ問題を
-- 回避済み（作者は自分の archived/hidden な投稿の画像・タグを読める）。
-- posts 本体にも同じ考え方の permissive policy を追加し、他の SELECT ポリシー
-- とは OR で合成させる（既存の posts_select は変更しない）
--
-- USING は author_id のみで status も deleted_at も見ない（deleted_at is null を
-- 足すと、論理削除した自分の投稿を作者が二度と UPDATE/DELETE できなくなり同じ
-- クラスのバグを作り直すため）。結果として RLS は「削除済み・非公開投稿を隠す
-- 安全網」ではなくなるので、一覧・タイムライン系のクエリは必ずアプリ層で
-- status='published' / deleted_at is null を明示すること
--   docs/architecture/data-model/tables.md #posts
-- ============================================

create policy posts_select_own
  on public.posts for select
  to authenticated
  using (author_id = (select auth.uid()));
