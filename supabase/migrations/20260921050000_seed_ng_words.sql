-- ============================================
-- NGワード初期セット（代表20語）
--
-- 20260905120400_seed_master_data.sql と同じ理由でマイグレーションに置く
-- （supabase/seed.sql は db push に乗らず本番に届かない）。
--   docs/seed/ng-words-initial-set.md
--   docs/product/pending-items.md B4
-- ============================================

insert into public.ng_words (word, severity, category) values
  ('死ね', 'block', 'harassment'),
  ('殺す', 'block', 'harassment'),
  ('きもい', 'warn', 'harassment'),
  ('うざい', 'warn', 'harassment'),
  ('ぶす', 'warn', 'harassment'),
  ('デブ', 'warn', 'harassment'),
  ('消えろ', 'warn', 'harassment'),
  ('出会い系', 'block', 'adult'),
  ('援助交際', 'block', 'adult'),
  ('パパ活', 'block', 'adult'),
  ('ライン交換', 'warn', 'adult'),
  ('セフレ', 'block', 'adult'),
  ('儲かる副業', 'block', 'spam'),
  ('今すぐ稼げる', 'block', 'spam'),
  ('副業紹介', 'warn', 'spam'),
  ('相互フォロー', 'warn', 'spam'),
  ('クリックして', 'warn', 'spam'),
  ('無料プレゼント', 'warn', 'spam'),
  ('個人情報', 'warn', 'other'),
  ('住所を教えて', 'block', 'other')
on conflict (word) do nothing;
