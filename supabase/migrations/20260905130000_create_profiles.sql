-- ============================================
-- profiles: ユーザープロフィール（auth.users と 1:1）
--
-- サインアップ直後は行が無い。生年月日の入力後にアプリが作る
-- （birth_date が NOT NULL なので auth.users のトリガーでは作れない）。
--   docs/architecture/data-model/tables.md #profiles
-- ============================================

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            extensions.citext not null unique,
  display_name        text not null,
  bio                 text,
  avatar_url          text,
  birth_date          date not null,
  status              text not null default 'active',
  guardian_email      text,
  guardian_consent_at timestamptz,
  role                text not null default 'user',
  home_area_code      text references public.areas (code) on delete set null,
  onboarded_at        timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profiles_status_check check (status in ('active', 'pending_consent', 'suspended', 'deleted')),
  constraint profiles_role_check check (role in ('user', 'owner', 'admin'))
);

comment on column public.profiles.onboarded_at is
  'オンボーディング完了日時。middleware が /onboarding へ誘導する唯一の判定材料で、JWT クレイムにも載る';
comment on column public.profiles.home_area_code is
  'ホームエリア。エリアの正は areas マスタなので自由テキストにしない';

create index profiles_role_idx on public.profiles (role) where role in ('owner', 'admin');
create index profiles_home_area_code_idx on public.profiles (home_area_code);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================
-- 年齢確認
-- ============================================

-- current_date は IMMUTABLE ではないので CHECK 制約には書けない。トリガーで担保する。
-- アプリ層（サインアップの Zod スキーマ）でも同じ判定を行い二重にガードする
create or replace function public.enforce_min_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > current_date - interval '13 years' then
    raise exception 'AGE_RESTRICTED';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_min_age
  before insert or update of birth_date on public.profiles
  for each row execute function public.enforce_min_age();

-- ============================================
-- 権限判定
-- ============================================

-- RLS ポリシーから呼ぶため SECURITY DEFINER。
-- profiles 自身のポリシーからも呼ぶので、RLS を経由しないことが必須
-- （経由すると自分自身のポリシー評価に再帰する）。
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and status = 'active'
  );
$$;

comment on function public.is_admin() is
  '現在のユーザーが有効な admin か。JWT クレイムではなく profiles を引くので降格が即座に効く';

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- role / status は本人に変えさせない。RLS の WITH CHECK は OLD 行を参照できないため、
-- 「どの列が変わったか」で判定するにはトリガーが要る
create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() が無いのは service_role か直接接続（seed・運用スクリプト）。
  -- ここを通さないと A9 の本番手順「最初の1人を service_role で昇格する」が塞がる。
  -- anon も uid が無いが、profiles の UPDATE ポリシーが authenticated 限定なので届かない
  if (select auth.uid()) is null then
    return new;
  end if;

  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_privileged_profile_columns();

-- ============================================
-- RLS
-- ============================================

alter table public.profiles enable row level security;

-- guardian_email / metadata は公開対象外だが、列単位の制御は View 側で行う。
-- ここで行を絞ると username からのプロフィール表示が成立しない
create policy profiles_select_all
  on public.profiles for select
  using (true);

create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id or public.is_admin())
  with check ((select auth.uid()) = id or public.is_admin());

-- DELETE ポリシーは置かない。退会は status='deleted' で無効化する
