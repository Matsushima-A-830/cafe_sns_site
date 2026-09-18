-- ============================================
-- user_cafe_lists: 「お気に入り」と「行きたい」を1テーブルに統合
--
-- 2つは排他ではない（同じカフェが両方に入る）。list_type を主キーに含めることで
-- 「お気に入りに入れたまま行きたいからは外す」が成立する。
--   docs/architecture/data-model/tables.md #user_cafe_lists
--   docs/glossary.md お気に入り=favorite / 行きたい=want_to_go
-- ============================================

create table public.user_cafe_lists (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  cafe_id    uuid not null references public.cafes (id) on delete cascade,
  list_type  text not null,
  note       text,
  created_at timestamptz not null default now(),

  constraint user_cafe_lists_pkey primary key (user_id, cafe_id, list_type),
  constraint user_cafe_lists_list_type_check check (list_type in ('favorite', 'want_to_go'))
);

comment on column public.user_cafe_lists.list_type is
  'favorite（常連・好きな店／既訪問想定）か want_to_go（まだ行っていない店）。
   主キーに含むので同じカフェが両方のリストに入る（docs/glossary.md）';
comment on column public.user_cafe_lists.note is
  'ユーザーメモ。UPDATE ポリシーが無いため現状は INSERT 時しか値を入れられない
   （編集導線は未実装 — docs/product/pending-items.md D32）';

-- 一覧（S_FAVORITES / S_WANT_TO_GO）の「user_id + list_type を追加日の新しい順」に対応する。
-- 主キーの (user_id, cafe_id, list_type) は list_type が第3列なので並び替えに使えない
create index user_cafe_lists_user_type_created_idx
  on public.user_cafe_lists (user_id, list_type, created_at desc);

-- ============================================
-- RLS
--
-- 「どの店に行きたいか」は行動履歴そのものなので、cafe_congestion_reports と同じく
-- 本人だけに閉じる（admin にも開けない: 集計して見せる画面が無い）。
-- UPDATE ポリシーは置かない（＝拒否）。リストの出し入れは INSERT / DELETE で行う。
-- ============================================

alter table public.user_cafe_lists enable row level security;

create policy user_cafe_lists_select_own
  on public.user_cafe_lists for select
  to authenticated
  using (user_id = (select auth.uid()));

-- CLAUDE.md「未成年アカウントは追加のガード」。suspended / pending_consent は
-- リストへの追加もできない（drafts_insert_own・cafe_congestion_reports_insert_own と同じ）
create policy user_cafe_lists_insert_own
  on public.user_cafe_lists for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));

-- 解除は停止中でも通す。追加を止めるのは書き込みの抑制だが、
-- 解除を止めると「自分のリストから外せない」状態に閉じ込めてしまう
create policy user_cafe_lists_delete_own
  on public.user_cafe_lists for delete
  to authenticated
  using (user_id = (select auth.uid()));
