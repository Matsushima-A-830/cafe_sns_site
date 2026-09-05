-- ============================================
-- user_settings: S_SETTINGS の永続化項目
--
-- profiles.metadata の jsonb ではなく型付きの1:1テーブルにする。
-- 通知トリガーが SQL から直接読むため、jsonb だとキャストとキー欠落の考慮が要る。
--   docs/architecture/data-model/tables.md #user_settings
-- ============================================

create table public.user_settings (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  notify_like          boolean not null default true,
  notify_comment       boolean not null default true,
  notify_follow        boolean not null default true,
  notify_email         boolean not null default true,
  use_location         boolean not null default true,
  allow_recommendation boolean not null default true,
  font_scale           text not null default 'normal',
  updated_at           timestamptz not null default now(),

  constraint user_settings_font_scale_check check (font_scale in ('small', 'normal', 'large'))
);

comment on column public.user_settings.notify_email is
  'MVP でメール通知は実装しない（pending-items B7）。列だけ置き、既定 true のまま未使用';

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ============================================
-- 既定値の行を profiles と同時に作る
-- ============================================

-- アプリ側に「行が無い」場合の分岐を書かせないための担保。
-- 本人が INSERT した profiles に対して行を作るので SECURITY DEFINER が要る
create or replace function public.create_default_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return null;
end;
$$;

create trigger profiles_create_default_settings
  after insert on public.profiles
  for each row execute function public.create_default_user_settings();

-- ============================================
-- RLS
-- ============================================

alter table public.user_settings enable row level security;

create policy user_settings_select_own
  on public.user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy user_settings_insert_own
  on public.user_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_settings_update_own
  on public.user_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- DELETE ポリシーは置かない（profiles の削除に CASCADE で追随させる）
