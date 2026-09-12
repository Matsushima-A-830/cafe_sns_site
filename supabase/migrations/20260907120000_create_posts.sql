-- ============================================
-- posts: 投稿本体（short / blog）
--
-- 幹A（気分検索）の主対象であり、幹C（オーナー連携）の is_official 投稿も
-- ここに含む。全文検索は simple tsvector + pg_trgm の2本立て
-- （tiptap_to_plaintext は 20260905120000 で定義済み）。
--   docs/architecture/data-model/tables.md #posts
-- ============================================

create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  -- 退会（auth.users 削除 → profiles カスケード）で本人の投稿も道連れに消す。
  -- NOT NULL のため on delete set null は選べず、他の profiles 参照FK
  -- （post_images 等）と同じ cascade 運用に揃える
  author_id      uuid not null references public.profiles (id) on delete cascade,
  cafe_id        uuid references public.cafes (id),
  post_type      text not null default 'short',
  title          text,
  body_json      jsonb not null,
  body_text      text generated always as (
    coalesce(public.tiptap_to_plaintext(body_json), '')
  ) stored,
  body_search    tsvector generated always as (
    to_tsvector('simple',
      coalesce(public.tiptap_to_plaintext(body_json), '')
      || ' ' || coalesce(title, ''))
  ) stored,
  status         text not null default 'published',
  visibility     text not null default 'public',
  like_count     int not null default 0,
  comment_count  int not null default 0,
  bookmark_count int not null default 0,
  is_official    boolean not null default false,
  official_format text,
  metadata       jsonb not null default '{}'::jsonb,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint posts_status_check check (status in ('published', 'archived', 'hidden')),
  constraint posts_post_type_check check (post_type in ('short', 'blog')),
  constraint posts_visibility_check check (visibility in ('public', 'followers')),
  constraint posts_official_format_check
    check (official_format is null or official_format in ('tip', 'today_special', 'closure', 'new_menu')),
  -- 公式投稿は必ずカフェに紐づく。「認証済みオーナーのみ」は CHECK ではサブクエリを
  -- 書けないため表現できず、guard_posts_official_owner トリガーと RLS で担保する
  constraint posts_official_requires_cafe_check check (is_official = false or cafe_id is not null),
  -- official_format は公式投稿専用の項目。is_official=false なのに
  -- official_format だけ埋まっている一般投稿を防ぐ
  constraint posts_official_format_requires_official_check
    check (official_format is null or is_official)
);

comment on column public.posts.body_text is
  '本文の平文。GENERATED カラムは他の GENERATED カラムを参照できないため、
   body_search と同様に body_json から独立に tiptap_to_plaintext() を計算する
   （STORED なので書き込み時の1回だけ）。docs/architecture/data-model/tables.md #全文検索の方式';
comment on column public.posts.metadata is
  '公式投稿の official_format 別項目（tip/today_special/new_menu/closure）。
   専用カラムを増やさず jsonb に寄せ、境界（lib/validators/posts.ts）で Zod 検証する';
comment on column public.posts.is_official is
  '経営者による公式投稿フラグ（幹C）。true にできるのは cafe_id の verified_owner_id
   本人のみ — guard_posts_official_owner トリガー（service_role 経由も含めて防ぐ）と
   posts_insert / posts_update の RLS WITH CHECK の両方で担保する';

create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index posts_cafe_created_idx on public.posts (cafe_id, created_at desc) where cafe_id is not null;
create index posts_body_search_idx on public.posts using gin (body_search);
create index posts_body_text_trgm_idx on public.posts using gin (body_text extensions.gin_trgm_ops);
create index posts_published_idx on public.posts (published_at desc) where status = 'published' and deleted_at is null;

create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ============================================
-- published_at の自動設定
--
-- 列にも default にも値の出所が無く、posts_published_idx とタイムライン
-- （published_at desc）は published_at が入っている前提で設計されている。
-- status='published' になった瞬間（初回作成時 or archived/hidden からの復帰時）に
-- 未設定なら now() を補う。明示的に予約投稿等で値を送ってきた場合は上書きしない
-- ============================================

create or replace function public.set_posts_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger posts_set_published_at
  before insert or update of status on public.posts
  for each row execute function public.set_posts_published_at();

-- ============================================
-- is_official の書き込みガード
--
-- RLS の WITH CHECK は auth.uid() を前提にするため service_role 経由の書き込み
-- （バッチ処理・管理操作）では迂回できてしまう。author_id と cafe_id の関係だけで
-- 判定するトリガーを併置し、どの経路から来ても「is_official=true は cafe_id の
-- verified_owner_id が author_id 本人のときだけ」を守る。cafes.sql の
-- guard_cafes_verified_owner と同じ考え方
-- （docs/architecture/data-model/tables.md #posts）
--
-- security definer にする理由: cafes の SELECT RLS（cafes_select_active_*）は
-- status='active' のカフェしか見せない。invoker のままだと、臨時休業
-- （official_format='closure'）を出したいまさにそのとき — カフェが closed/hidden
-- になった直後 — に、認証済みオーナー本人からも cafes 行が見えず EXISTS が
-- 常に偽になって FORBIDDEN を返してしまう。is_cafe_owner() と同じ理由
-- ============================================

create or replace function public.guard_posts_official_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_official and not exists (
    select 1 from public.cafes c
    where c.id = new.cafe_id and c.verified_owner_id = new.author_id
  ) then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end;
$$;

create trigger posts_guard_official_owner
  before insert or update of is_official, cafe_id, author_id on public.posts
  for each row execute function public.guard_posts_official_owner();

-- ============================================
-- is_blocked_either_way: 呼び出し元と指定ユーザーがどちらかの向きでブロックし合っているか
--
-- tables.md #posts の posts_select サンプルSQLは blocks を直接 EXISTS で見るが、
-- blocks_select_own は「ブロックした本人にしか見せない」（blocker_id = auth.uid()）
-- ため、「相手が自分をブロックした」側の行は RLS 越しに見えず、EXISTS が
-- 常に偽になって片方向しか除外できない（bidirectional ブロック除外が壊れる）。
-- is_cafe_owner() と同じ理由で SECURITY DEFINER にして blocks の RLS を
-- バイパスし、両方向を正しく判定する
-- （docs/architecture/data-model/tables.md #posts, #blocks）
-- ============================================

create or replace function public.is_blocked_either_way(p_other_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_other_id)
       or (b.blocker_id = p_other_id and b.blocked_id = (select auth.uid()))
  );
$$;

comment on function public.is_blocked_either_way(uuid) is
  '呼び出し元と p_other_id がどちらの向きでもブロックし合っていないか。blocks の
   SELECT RLS（blocker本人にしか見せない）をバイパスするため security definer';

-- anon からも posts_select 越しに呼ばれる（auth.uid() が null になるだけで、
-- blocked_id/blocker_id のどちらにも一致しないため常に false を返す）
revoke execute on function public.is_blocked_either_way(uuid) from public;
grant execute on function public.is_blocked_either_way(uuid) to anon, authenticated;

-- ============================================
-- RLS
-- ============================================

alter table public.posts enable row level security;

-- visibility='followers' は作者本人とフォロワーのみ。ブロック関係にある相手からは
-- 双方向に不可視にする。未ログインからは followers 限定投稿を常に見せない
-- （anon/authenticated を分けず auth.uid() が null のときは follows / 作者一致の
-- いずれも成立しないため、この1本で両ロールをカバーできる。is_blocked_either_way も
-- 同じ理由で anon から呼んでも常に false を返すだけで安全）
create policy posts_select
  on public.posts for select
  to anon, authenticated
  using (
    status = 'published'
    and deleted_at is null
    and (
      visibility = 'public'
      or author_id = (select auth.uid())
      or exists (
        select 1 from public.follows f
        where f.followee_id = posts.author_id and f.follower_id = (select auth.uid())
      )
    )
    and not public.is_blocked_either_way(posts.author_id)
  );

create policy posts_insert
  on public.posts for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.is_active_user())
    and (
      is_official = false
      -- is_cafe_owner()（cafe_business_hours.sql で定義済み）は security definer で
      -- cafes の RLS をバイパスする。guard_posts_official_owner と同じ理由で、
      -- raw EXISTS だと closed/hidden なカフェのオーナーが弾かれてしまうため使う
      or public.is_cafe_owner(posts.cafe_id)
    )
  );

create policy posts_update_own
  on public.posts for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and (select public.is_active_user()));

create policy posts_delete_own
  on public.posts for delete
  to authenticated
  using (author_id = (select auth.uid()));
