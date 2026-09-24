-- ============================================
-- likes_select_all に投稿の可視性を継承させる（D38）
--
-- 既存の likes_select_all は not is_blocked_either_way(likes.user_id) だけで、
-- post_id が指す投稿が hidden・archived・論理削除済み・非公開（visibility='followers'
-- で非フォロワー）であっても「誰がいいねしたか」は post_id さえ分かれば誰でも読めていた。
-- comments_select_visible（20260920120000_create_comments.sql）で固めた
-- 「posts への EXISTS で posts_select をそのまま継承 + is_post_author の OR」パターンを
-- 横展開する。likes に deleted_at は無いので、その部分は comments と異なり不要。
--   docs/product/pending-items.md D38
-- ============================================

drop policy likes_select_all on public.likes;

create policy likes_select_all
  on public.likes for select
  to anon, authenticated
  using (
    (
      exists (select 1 from public.posts p where p.id = likes.post_id)
      or public.is_post_author(likes.post_id)
    )
    and not public.is_blocked_either_way(likes.user_id)
  );

comment on policy likes_select_all on public.likes is
  '投稿の可視性（posts_select）を継承する。EXISTS のサブクエリは呼び出し元のロールで
   実行されるため posts_select の RLS がそのまま効く。is_post_author の OR で、
   作者本人には自分の hidden/archived な投稿へのいいねも見せる。ブロック関係は従来どおり。
   docs/product/pending-items.md D38';

-- ============================================
-- count_likes_given: lib/badges/rules.ts の likes_given 判定用
--
-- 上の可視性継承により、likes への SELECT はすべて posts_select 経由で暗黙にフィルタされる。
-- countLikesGiven（呼び出しセッション＝いいねした本人で likes.user_id を絞るだけ）は、
-- 対象の投稿が後から hidden/archived/削除/フォロー外れで見えなくなった時点で、
-- そのいいねを静かに数えなくなり過小評価になる（count_likes_received で一度発生した問題と同型）。
-- RLS をバイパスする集計専用の関数に切り出す
-- ============================================

create or replace function public.count_likes_given(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.likes l
  join public.posts p on p.id = l.post_id
  where l.user_id = p_user_id and p.status = 'published' and p.deleted_at is null;
$$;

comment on function public.count_likes_given(uuid) is
  'lib/badges/rules.ts の likes_given 判定用。RLS（posts_select の visibility 制限）を
   バイパスして、呼び出しセッションの可視範囲に関係なく実際に送ったいいね数を返す';

revoke execute on function public.count_likes_given(uuid) from public;
grant execute on function public.count_likes_given(uuid) to anon, authenticated;

-- ============================================
-- badge_criteria_met の likes_given 分岐を count_likes_given に揃える
--
-- badge_criteria_met は award_badge の唯一の権威ある判定（20260923130000 のコメント参照）。
-- likes_given 分岐だけが `count(*) from likes where user_id = ...` の無絞り込みのままだと、
-- lib/badges/rules.ts の countLikesGiven（上の count_likes_given RPC、status='published' と
-- deleted_at is null で絞る）と食い違う。checkAndAwardBadges の evaluateCriteria が
-- 事前フィルタとして false を返す（hidden な投稿ぶんを除いたら閾値未達）のに、
-- badge_criteria_met はそれを含めて true を返してしまうと、award_badge へ辿り着けず
-- 「本当は条件を満たしているのに永久に付与されない」食い違いが起きる
-- （count_likes_received を likes_received 分岐に使ったのと同じ理由で揃える）
-- ============================================

create or replace function public.badge_criteria_met(p_user_id uuid, p_criteria jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text := p_criteria ->> 'type';
  v_threshold numeric := (p_criteria ->> 'threshold')::numeric;
  v_actual numeric;
begin
  if v_type = 'post_count' then
    select count(*) into v_actual
    from public.posts
    where author_id = p_user_id and status = 'published' and deleted_at is null;

  elsif v_type = 'distinct_area_count' then
    select count(*) into v_actual
    from public.area_visits av
    join public.areas a on a.code = av.area_code
    where av.user_id = p_user_id
      and a.level = p_criteria -> 'scope' ->> 'level'
      and (
        p_criteria -> 'scope' ->> 'prefecture_code' is null
        or a.prefecture_code = p_criteria -> 'scope' ->> 'prefecture_code'
      );

  elsif v_type = 'post_count_with_tag' then
    select count(distinct pt.post_id) into v_actual
    from public.post_tags pt
    join public.posts p on p.id = pt.post_id
    join public.tags t on t.id = pt.tag_id
    where p.author_id = p_user_id and p.status = 'published' and p.deleted_at is null
      and t.slug = p_criteria ->> 'tag_slug';

  elsif v_type = 'post_count_with_tags_or' then
    select count(distinct pt.post_id) into v_actual
    from public.post_tags pt
    join public.posts p on p.id = pt.post_id
    join public.tags t on t.id = pt.tag_id
    where p.author_id = p_user_id and p.status = 'published' and p.deleted_at is null
      and t.slug in (select jsonb_array_elements_text(p_criteria -> 'tag_slugs'));

  elsif v_type = 'distinct_scene_tag_count' then
    select count(distinct pt.tag_id) into v_actual
    from public.post_tags pt
    join public.posts p on p.id = pt.post_id
    join public.tags t on t.id = pt.tag_id
    where p.author_id = p_user_id and p.status = 'published' and p.deleted_at is null
      and t.category = p_criteria ->> 'category';

  elsif v_type = 'regular_customer_count' then
    select count(*) into v_actual
    from public.regular_customers
    where user_id = p_user_id and revoked_at is null;

  elsif v_type = 'follower_count' then
    select count(*) into v_actual from public.follows where followee_id = p_user_id;

  elsif v_type = 'likes_received' then
    select public.count_likes_received(p_user_id) into v_actual;

  elsif v_type = 'likes_given' then
    select public.count_likes_given(p_user_id) into v_actual;

  else
    return false;
  end if;

  return v_actual >= v_threshold;
end;
$$;

comment on function public.badge_criteria_met(uuid, jsonb) is
  'award_badge の唯一の権威ある判定。lib/badges/rules.ts の evaluateCriteria と同じ
   9種の criteria.type を、呼び出しセッションの RLS 可視範囲に関係なく実データで判定する。
   likes_given / likes_received は count_likes_given / count_likes_received RPC を使い、
   lib 側の事前フィルタと絞り込み条件を一致させる';
