-- ============================================
-- regular_customers: オーナーが顧客に付与する「常連さん」認定（幹C）
--
-- ユーザー側は自分の「行きつけカフェ」として表示する（今回のPRでは表示UIは
-- 開通しない。docs/product/pending-items.md D28/D32）。
--   docs/architecture/data-model/tables.md #regular_customers
-- ============================================

create table public.regular_customers (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  cafe_id     uuid not null references public.cafes (id) on delete cascade,
  awarded_by  uuid not null references public.profiles (id) on delete restrict,
  note        text,
  awarded_at  timestamptz not null default now(),
  revoked_at  timestamptz,

  primary key (user_id, cafe_id),
  constraint regular_customers_revoked_after_awarded_check
    check (revoked_at is null or revoked_at >= awarded_at)
);

comment on table public.regular_customers is
  'オーナーが顧客に付与する常連認定。DELETE は許可せず revoked_at で取消履歴を残す。
   docs/architecture/data-model/tables.md #regular_customers';

-- S_OWNER_REGULARS の一覧（常連タブ・認定履歴タブ）で使う
create index regular_customers_cafe_awarded_at_idx
  on public.regular_customers (cafe_id, awarded_at desc);

-- ユーザーの「行きつけ」一覧用（現在有効な認定のみ）
create index regular_customers_user_active_idx
  on public.regular_customers (user_id)
  where revoked_at is null;

-- ============================================
-- RLS
--
-- is_cafe_owner() / is_active_user() は cafe_business_hours 側のマイグレーション
-- （20260906140000）で定義済み。
-- ============================================

alter table public.regular_customers enable row level security;

-- 全ユーザーに公開するのは「現在有効な認定」のみ（プロフィール表示用）
create policy regular_customers_select_active
  on public.regular_customers for select
  to anon, authenticated
  using (revoked_at is null);

-- オーナーは自店の認定を取消済みも含めて全件読める（S_OWNER_REGULARS の認定履歴タブ）
create policy regular_customers_select_owner
  on public.regular_customers for select
  to authenticated
  using (public.is_cafe_owner(cafe_id));

create policy regular_customers_insert_owner
  on public.regular_customers for insert
  to authenticated
  with check (
    awarded_by = (select auth.uid())
    and public.is_cafe_owner(cafe_id)
    and (select public.is_active_user())
  );

-- 取消（revoked_at 設定）・メモ編集ともに認定オーナーのみ
create policy regular_customers_update_owner
  on public.regular_customers for update
  to authenticated
  using (public.is_cafe_owner(cafe_id) and (select public.is_active_user()))
  with check (public.is_cafe_owner(cafe_id) and (select public.is_active_user()));

-- DELETE は許可しない（履歴保持のためポリシーを置かない＝拒否）

-- ============================================
-- notify_on_regular_awarded: 常連認定 INSERT → 認定されたユーザーへの通知
--
-- notifications.type='regular_awarded' は user_settings に対応するトグル列が無く、
-- official_post と同じ「ユーザーが切れない通知」として扱う（tables.md に抑制条件の
-- 記載が無い）。security definer が必須な理由は notify_on_like 等と同じ:
-- notifications に INSERT ポリシーが無く、recipient(=user_id) 以外の行を作る必要がある
-- ============================================

create or replace function public.notify_on_regular_awarded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_blocked_either_way(new.user_id) then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
  values (new.user_id, new.awarded_by, 'regular_awarded', 'cafe', new.cafe_id);

  return new;
end;
$$;

comment on function public.notify_on_regular_awarded() is
  '常連認定されたユーザーへ通知する。ブロック関係にある場合のみ抑制する
   （official_post と同じく user_settings のトグルは無い）';

create trigger regular_customers_notify_on_awarded
  after insert on public.regular_customers
  for each row execute function public.notify_on_regular_awarded();

-- ============================================
-- get_regular_candidates: 認定候補の集計（S_OWNER_REGULARS 認定候補タブ）
--
-- security definer にする理由: profiles の SELECT は全ユーザーに公開されているため
-- 本来 RLS バイパスは必須ではないが、呼び出しユーザーが対象カフェのオーナーかを
-- 関数内で一元的に検査したい（PostgREST 経由の任意呼び出しから他店の集計を
-- 覗けないようにする）ため、get_cafe_congestion_current と同じ形に揃える。
--
-- posts.bookmark_count / like_count はトリガーで維持される非正規化カウンタで
-- SELECT が全ユーザーに公開されている（posts_select_public）ため、post_bookmarks
-- テーブル本体（SELECT が本人限定 = post_bookmarks_select_own）を直接集計する
-- 必要はない。これが引き継ぎメモの落とし穴1（保存数が常に0になる罠）の回避策。
--
-- 既に有効な常連（revoked_at is null）と、カフェのオーナー自身は候補から除外する。
-- status <> 'active'（停止中/同意待ち）のユーザーも除外する。
-- ============================================

create or replace function public.get_regular_candidates(p_cafe_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  post_count int,
  comment_count int,
  bookmark_count int,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_cafe_owner(p_cafe_id) or public.is_admin()) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  with post_stats as (
    select
      p.author_id as user_id,
      count(*) as post_count,
      sum(p.bookmark_count) as bookmark_count,
      max(p.published_at) as last_posted_at
    from public.posts p
    where p.cafe_id = p_cafe_id
      and p.status = 'published'
      and p.deleted_at is null
    group by p.author_id
  ),
  comment_stats as (
    select
      c.author_id as user_id,
      count(*) as comment_count,
      max(c.created_at) as last_commented_at
    from public.comments c
    join public.posts p on p.id = c.post_id
    where p.cafe_id = p_cafe_id
      and c.deleted_at is null
    group by c.author_id
  ),
  combined as (
    select
      coalesce(post_stats.user_id, comment_stats.user_id) as user_id,
      coalesce(post_stats.post_count, 0)::int as post_count,
      coalesce(comment_stats.comment_count, 0)::int as comment_count,
      coalesce(post_stats.bookmark_count, 0)::int as bookmark_count,
      greatest(post_stats.last_posted_at, comment_stats.last_commented_at) as last_activity_at
    from post_stats
    full outer join comment_stats on comment_stats.user_id = post_stats.user_id
  )
  select
    combined.user_id,
    prof.username::text,
    prof.display_name,
    prof.avatar_url,
    combined.post_count,
    combined.comment_count,
    combined.bookmark_count,
    combined.last_activity_at
  from combined
  join public.profiles prof on prof.id = combined.user_id
  where prof.status = 'active'
    and not exists (
      select 1 from public.cafes cf
      where cf.id = p_cafe_id and cf.verified_owner_id = combined.user_id
    )
    and not exists (
      select 1 from public.regular_customers rc
      where rc.cafe_id = p_cafe_id and rc.user_id = combined.user_id and rc.revoked_at is null
    )
  order by (combined.post_count + combined.comment_count) desc, combined.last_activity_at desc
  limit 50;
end;
$$;

comment on function public.get_regular_candidates(uuid) is
  '自店に紐づく投稿・コメント・保存の多いユーザーを常連認定候補として集計する。
   呼び出し元が対象カフェの verified_owner_id 本人（または admin）でなければ
   FORBIDDEN を raise する。既に有効な常連・オーナー自身・非activeユーザーは除外する。
   S_OWNER_REGULARS 認定候補タブが呼ぶ（引き継ぎメモの落とし穴1参照）';

revoke execute on function public.get_regular_candidates(uuid) from public;
grant execute on function public.get_regular_candidates(uuid) to authenticated;
