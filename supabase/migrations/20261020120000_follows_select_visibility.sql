-- ============================================
-- follows_select_all にブロックを反映する（D36）
--
-- likes_select_visibility（20260923150000）で likes.user_id にブロックを反映したのと
-- 同種の露出が follows に残っていた。follows_select_all は using (true) のままで、
-- follower_id で絞れば任意のユーザーが任意の相手のフォロー先一覧を、
-- followee_id で絞ればフォロワー一覧を、PostgREST 経由で直接読めていた。
--
-- likes は user_id 一列だけを見ればよかったが、follows は follower_id / followee_id の
-- 両方向があるため、どちらの列にブロック関係にある相手が出てきても行を隠す必要がある。
-- ブロック済みペアの直接の行は delete_follows_on_block（20260916120100）が消すので、
-- ここで塞ぐのは「ブロック相手が第三者との行に follower/followee として出てくるケース」
--   docs/product/pending-items.md D36
-- ============================================

-- is_blocked_either_way(a) / is_blocked_either_way(b) を素朴に2回呼ぶと blocks への
-- サブクエリが行ごとに2回走る。1回の exists にまとめて半分にする
-- （`/code-review` 指摘。posts_select の followers 可視性チェックが follows への
-- EXISTS 経由でこのポリシーを評価するため、投稿一覧のような多行スキャンでも使われる）
create or replace function public.is_blocked_either_way_any(p_id_a uuid, p_id_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id in (p_id_a, p_id_b))
       or (b.blocker_id in (p_id_a, p_id_b) and b.blocked_id = (select auth.uid()))
  );
$$;

comment on function public.is_blocked_either_way_any(uuid, uuid) is
  'is_blocked_either_way を follower_id/followee_id の2引数ぶんまとめて1回の exists で
   判定する版。follows_select_all 専用（呼び出し元と2つのIDのどちらかがブロックし合って
   いるか）。blocks の RLS（blocker本人にしか見せない）をバイパスするため security definer';

revoke execute on function public.is_blocked_either_way_any(uuid, uuid) from public;
grant execute on function public.is_blocked_either_way_any(uuid, uuid) to anon, authenticated;

drop policy follows_select_all on public.follows;

create policy follows_select_all
  on public.follows for select
  to anon, authenticated
  using (not public.is_blocked_either_way_any(follows.follower_id, follows.followee_id));

comment on policy follows_select_all on public.follows is
  'ブロック関係にある相手が follower / followee どちらの列に出てくる行も隠す。
   フォロー数・フォロワー数は閲覧者非依存を保つため count_following / count_followers RPC
   経由で集計し、このポリシーの影響を受けない設計にする。
   docs/product/pending-items.md D36';

-- ============================================
-- count_following / count_followers:
--   lib/profiles/public-profile.ts の getProfileCounts
--   lib/badges/rules.ts の countFollowers（follower_count バッジ判定の事前フィルタ）
--
-- 上のブロック反映により、follows への素朴な count クエリは「呼び出しセッション
-- （auth.uid()）とその行の相手がブロックし合っているか」で結果が変わってしまう。
-- フォロー数・フォロワー数は tables.md のとおり閲覧者非依存（likes.like_count と同じ
-- 判断）なので、RLS をバイパスする集計専用の関数に切り出す。
--
-- badge_criteria_met の follower_count 分岐はこの変更以前から security definer で
-- RLS を完全にバイパスしているため変更不要（20260923150000 のコメント参照）。
-- countFollowers だけを揃えないと、lib 側の事前フィルタ（evaluateCriteria）が
-- 呼び出しセッションと無関係な第三者間のブロックで過小評価し、badge_criteria_met との
-- 食い違いで award_badge に辿り着けなくなる（count_likes_given と同じ理由）
-- ============================================

create or replace function public.count_following(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.follows where follower_id = p_user_id;
$$;

create or replace function public.count_followers(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.follows where followee_id = p_user_id;
$$;

comment on function public.count_following(uuid) is
  'lib/profiles/public-profile.ts の getProfileCounts（following）用。RLS
   （follows_select_all のブロック反映）をバイパスして、閲覧者非依存のフォロー数を返す';

comment on function public.count_followers(uuid) is
  'lib/profiles/public-profile.ts の getProfileCounts（followers）と
   lib/badges/rules.ts の countFollowers（COM_10_FOLLOWERS 判定）用。RLS をバイパスして
   閲覧者非依存のフォロワー数を返す';

revoke execute on function public.count_following(uuid) from public;
grant execute on function public.count_following(uuid) to anon, authenticated;

revoke execute on function public.count_followers(uuid) from public;
grant execute on function public.count_followers(uuid) to anon, authenticated;
