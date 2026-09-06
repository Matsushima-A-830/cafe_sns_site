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
  constraint cafe_business_hours_day_of_week_check check (day_of_week between 0 and 6)
);

comment on column public.cafe_business_hours.day_of_week is
  '0=日曜〜6=土曜（Postgres の extract(dow from ... at time zone ''utc'') と同じ基準。
   get_cafe_congestion_current() 等の曜日集計とズレさせない）';

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
  with check (public.is_cafe_owner(cafe_id) or (select public.is_admin()));

create policy cafe_business_hours_update_owner
  on public.cafe_business_hours for update
  to authenticated
  using (public.is_cafe_owner(cafe_id) or (select public.is_admin()))
  with check (public.is_cafe_owner(cafe_id) or (select public.is_admin()));

create policy cafe_business_hours_delete_owner
  on public.cafe_business_hours for delete
  to authenticated
  using (public.is_cafe_owner(cafe_id) or (select public.is_admin()));
