-- ============================================
-- cafes: カフェ情報
--
-- 幹A（気分検索）と幹C（オーナー連携）の両方が参照する中心テーブル。
-- 「誰でも新規カフェを登録できる（until claim される）」設計なので、
-- verified_owner_id は別テーブル（cafe_owner_verifications、後続PR）の
-- 認証フローを経てから admin が付与する。認証済み本人にも自称させない。
--   docs/architecture/data-model/tables.md #cafes
-- ============================================

create table public.cafes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  name_kana          text,
  prefecture         text not null,
  city               text not null,
  area_code          text references public.areas (code) on delete set null,
  address            text,
  main_image_path    text,
  location           geography(point, 4326),
  phone              text,
  website            text,
  description        text,
  external_ids       jsonb not null default '{}'::jsonb,
  verified_owner_id  uuid references public.profiles (id) on delete set null,
  status             text not null default 'active',
  created_by         uuid references public.profiles (id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint cafes_status_check check (status in ('active', 'closed', 'hidden'))
);

comment on column public.cafes.main_image_path is
  'S_CAFE_DETAIL のヒーロー画像 / OG画像が参照する唯一の画像列。複数枚の cafe_images テーブルは作らない
   （店側は看板1枚で足りる。3回同じ要求が出てから拡張を検討する）。未設定時は最新投稿の1枚目にフォールバックする
   （posts 実装後の後続対応）';
comment on column public.cafes.verified_owner_id is
  '認証済みオーナー。cafe_owner_verifications の審査を経て admin だけが付与する（本人の自称を防ぐガードは
   cafes_guard_verified_owner トリガー）';
comment on column public.cafes.area_code is
  '投稿トリガーで area_visits.area_code に伝搬される。NULL のカフェは制覇マップに計上されない（意図的）';

create index cafes_location_idx on public.cafes using gist (location);
create index cafes_prefecture_city_area_idx on public.cafes (prefecture, city, area_code);
create index cafes_area_code_idx on public.cafes (area_code);
create index cafes_name_kana_trgm_idx on public.cafes using gin (name_kana gin_trgm_ops);

create trigger cafes_updated_at
  before update on public.cafes
  for each row execute function public.set_updated_at();

-- ============================================
-- verified_owner_id の書き換えガード
--
-- profiles.guard_privileged_profile_columns と同じ考え方。RLS の
-- UPDATE ポリシーは「誰が行を更新できるか」しか絞れないので、
-- 「誰でも作成できる」INSERT で最初から自分を認証済みオーナーとして
-- 送り込む自称オーナー攻撃を、列単位のトリガーで別途塞ぐ。
-- ============================================

create or replace function public.guard_cafes_verified_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() が無いのは service_role か直接接続（seed・cafe_owner_verifications 承認処理）
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verified_owner_id is not null and not public.is_admin() then
      raise exception 'FORBIDDEN';
    end if;
    return new;
  end if;

  if new.verified_owner_id is distinct from old.verified_owner_id and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger cafes_guard_verified_owner
  before insert or update of verified_owner_id on public.cafes
  for each row execute function public.guard_cafes_verified_owner();

-- ============================================
-- RLS
-- ============================================

alter table public.cafes enable row level security;

-- is_admin() は他テーブルでは `to authenticated` のポリシーからしか呼ばれておらず、
-- anon への EXECUTE は Supabase のデフォルト権限（関数作成時に自動付与）に暗黙で
-- 依存していた。cafes_select_active は anon にも開くため、ここで明示しておく
-- （デフォルト権限が将来変更されても壊れないように）。
grant execute on function public.is_admin() to anon;

create policy cafes_select_active
  on public.cafes for select
  using (status = 'active' or public.is_admin());

create policy cafes_insert_authenticated
  on public.cafes for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

create policy cafes_update_owner
  on public.cafes for update
  to authenticated
  using (verified_owner_id = (select auth.uid()) or public.is_admin())
  with check (verified_owner_id = (select auth.uid()) or public.is_admin());

create policy cafes_delete_admin
  on public.cafes for delete
  to authenticated
  using (public.is_admin());
