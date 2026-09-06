-- ============================================
-- cafe_business_hours: カフェの通常営業時間（曜日ごと）
--
-- S_CAFE_DETAIL の営業時間表示に使う。臨時休業・特別営業時間は対象外
-- （cafe_special_hours は見送り。docs/product/pending-items.md B5）。
--   docs/architecture/data-model/tables.md #cafe_business_hours
-- ============================================

create table public.cafe_business_hours (
  cafe_id      uuid not null references public.cafes (id) on delete cascade,
  day_of_week  smallint not null,
  opens_at     time,
  closes_at    time,
  is_closed    boolean not null default false,
  notes        text,

  primary key (cafe_id, day_of_week),
  constraint cafe_business_hours_day_of_week_check check (day_of_week between 0 and 6),
  -- 定休日でないのに営業時間が両方 NULL の状態（「開いているが何時か不明」）を防ぐ。
  -- 深夜営業（22:00始まり〜翌02:00終わり等）は opens_at > closes_at として許容し、
  -- 日をまたぐ判定はアプリ側で行う（DB側で順序を強制しない）
  constraint cafe_business_hours_hours_present_check
    check (is_closed or (opens_at is not null and closes_at is not null))
);

comment on column public.cafe_business_hours.day_of_week is
  '0=日曜〜6=土曜。カフェの現地時刻（JST）の暦日を指す — opens_at/closes_at が
   壁時計時刻（time型）である以上、その日を特定するのも常に JST でなければならない。
   get_cafe_congestion_current() 側の曜日集計は UTC 基準だが、あれは統計バケットの
   区切りに過ぎず「今日は何曜日か」という現地の意味を持たない別概念なので揃えない。
   「今日の営業時間」を引く側は必ず JST（例: now() at time zone ''Asia/Tokyo''）で
   曜日を求めること';

-- ============================================
-- is_cafe_owner: 呼び出し元が指定カフェの verified_owner_id 本人か
--
-- 「更新は cafes と同じ権限」（tables.md）を INSERT/UPDATE/DELETE の
-- 3操作すべてに適用するため、同じ判定を1ファイル内で4回書くことになる
-- （3回同じパターンが出たら抽象化する原則。CLAUDE.md）ので関数に切り出す。
--
-- is_admin() と同じく security definer にする: invoker のままだと
-- 判定用の EXISTS が public.cafes の SELECT RLS 越しになり、cafes.status
-- が 'hidden'（authenticated は status='active' or admin しか見えない）の
-- カフェではオーナー本人ですら自分の営業時間を管理できなくなってしまう。
-- ============================================

create or replace function public.is_cafe_owner(p_cafe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cafes
    where id = p_cafe_id and verified_owner_id = (select auth.uid())
  );
$$;

comment on function public.is_cafe_owner(uuid) is
  '呼び出し元が指定カフェの verified_owner_id 本人か。cafes の SELECT RLS を
   バイパスするため security definer（is_admin() と同じ理由）';

revoke execute on function public.is_cafe_owner(uuid) from public;
grant execute on function public.is_cafe_owner(uuid) to authenticated;

-- ============================================
-- is_active_user: 呼び出し元が status='active' の本人か
--
-- CLAUDE.md の必須ルール「未成年アカウントは追加のガード（RLSで
-- profiles.status = 'active' チェック）」。cafe_congestion_reports の
-- INSERT ポリシーからも参照するため、先に適用されるこのマイグレーションで
-- 定義する。is_admin() と同じ理由で security definer にする。
-- ============================================

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and status = 'active'
  );
$$;

comment on function public.is_active_user() is
  '呼び出し元が status=active の本人か。suspended / pending_consent のユーザーの書き込みを弾くのに使う';

revoke execute on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;

-- ============================================
-- RLS
-- ============================================

alter table public.cafe_business_hours enable row level security;

-- SELECT は全ユーザーに公開。is_admin() を経由しないので anon にも安全に開ける
-- （cafes.sql と同じ理由でロールを分けていない: hidden なカフェの営業時間まで
-- 見せたくなったら cafes と同様に anon/authenticated でポリシーを分割する）
create policy cafe_business_hours_select_all
  on public.cafe_business_hours for select
  using (true);

create policy cafe_business_hours_insert_owner
  on public.cafe_business_hours for insert
  to authenticated
  with check (
    (public.is_cafe_owner(cafe_id) and (select public.is_active_user()))
    or (select public.is_admin())
  );

create policy cafe_business_hours_update_owner
  on public.cafe_business_hours for update
  to authenticated
  using (
    (public.is_cafe_owner(cafe_id) and (select public.is_active_user()))
    or (select public.is_admin())
  )
  with check (
    (public.is_cafe_owner(cafe_id) and (select public.is_active_user()))
    or (select public.is_admin())
  );

create policy cafe_business_hours_delete_owner
  on public.cafe_business_hours for delete
  to authenticated
  using (
    (public.is_cafe_owner(cafe_id) and (select public.is_active_user()))
    or (select public.is_admin())
  );
