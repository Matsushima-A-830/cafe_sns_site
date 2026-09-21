-- ============================================
-- cafe_owner_verifications: オーナー認証申請
--
--   docs/architecture/data-model/tables.md #cafe_owner_verifications
--   docs/design/wireframes/owner.md #s_owner_claimオーナー認証申請
--
-- document_urls の要素は {type, path} の jsonb オブジェクト。path は
-- owner-documents バケットのオブジェクトパスで、公開URLではなく
-- 署名付きURLを都度発行して参照する（README.md #権限）
-- ============================================

create table public.cafe_owner_verifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id),
  cafe_id         uuid not null references public.cafes (id),
  status          text not null default 'pending',
  document_urls   jsonb not null default '[]'::jsonb,
  contact_email   text not null,
  applicant_note  text,
  review_notes    text,
  reviewed_by     uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz,

  constraint cafe_owner_verifications_status_check
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  -- 書類2点以上（error-catalog.md DOCUMENTS_INSUFFICIENT）。空の予約行を先に
  -- INSERT する posts と同じパターンは使えないため、書類を全件アップロードし
  -- 終えてから一括 INSERT する設計にする（README.md #owner-documents-は予約行方式を使わない）
  constraint cafe_owner_verifications_documents_check
    check (jsonb_array_length(document_urls) >= 2)
);

comment on column public.cafe_owner_verifications.contact_email is
  '運営からの追加確認先。profiles のログイン用メールとは別に持つ';
comment on column public.cafe_owner_verifications.applicant_note is
  '屋号と本人氏名が異なる場合の説明等の補足事項';

-- 審査キュー（未処理を新しい順）
create index cafe_owner_verifications_status_created_idx
  on public.cafe_owner_verifications (status, created_at);
create index cafe_owner_verifications_user_id_idx
  on public.cafe_owner_verifications (user_id);

-- 同一カフェへの同時複数 pending 申請を防ぐ（VERIFICATION_ALREADY_PENDING）。
-- reports_open_unique と同型（supabase/migrations/20260921000000_create_reports.sql）
create unique index cafe_owner_verifications_pending_unique
  on public.cafe_owner_verifications (cafe_id)
  where status = 'pending';

-- ============================================
-- 既に別ユーザーが認証済みのカフェへの申請を弾く（CAFE_ALREADY_CLAIMED）
--
-- cafe_owner_verifications 単体の RLS/CHECK では cafes テーブルをまたぐ検証を
-- 表現できないため、BEFORE INSERT トリガーで判定する。guard_posts_official_owner
-- と同じ考え方（supabase/migrations/20260907120000_create_posts.sql）。
-- security definer にする理由も同じ: cafes の SELECT RLS は status='active' の
-- カフェしか見せないため、invoker のままだと closed/hidden 化直後に本人からも
-- 行が見えず EXISTS が常に偽になってしまう
-- ============================================

create or replace function public.guard_cafe_owner_verifications_cafe_claimed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cafes c
    where c.id = new.cafe_id and c.verified_owner_id is not null
  ) then
    raise exception 'CAFE_ALREADY_CLAIMED';
  end if;
  return new;
end;
$$;

create trigger cafe_owner_verifications_guard_claimed
  before insert on public.cafe_owner_verifications
  for each row execute function public.guard_cafe_owner_verifications_cafe_claimed();

-- ============================================
-- RLS
-- ============================================

alter table public.cafe_owner_verifications enable row level security;

create policy cafe_owner_verifications_select_own_or_admin
  on public.cafe_owner_verifications for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

create policy cafe_owner_verifications_insert_own
  on public.cafe_owner_verifications for insert
  to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_active_user()));

-- admin は審査（status変更）のため全面的に UPDATE 可。本人は pending→withdrawn の
-- 取り下げのみ許可したいが、RLS の USING/WITH CHECK は OLD 行の status を直接比較
-- できないため、本人分は WITH CHECK 側で新しい status が withdrawn 固定であることのみ
-- 縛る（pending 以外からの取り下げは業務上想定しないため許容。厳密化するならトリガー化）
create policy cafe_owner_verifications_update_admin
  on public.cafe_owner_verifications for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy cafe_owner_verifications_update_own_withdraw
  on public.cafe_owner_verifications for update
  to authenticated
  using ((select auth.uid()) = user_id and status = 'pending')
  with check ((select auth.uid()) = user_id and status = 'withdrawn');

-- DELETE ポリシーなし（履歴保持のため不可）
