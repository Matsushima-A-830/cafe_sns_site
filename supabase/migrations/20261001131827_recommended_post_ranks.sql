-- ============================================
-- recommended_post_ranks: S_HOME/S_EXPLORE「おすすめ」タブの並び順を決める関数。
--
-- 一致する興味タグの数が多い投稿を優先し、同数内は新着順にする（pending-items D24 対応案b）。
-- PostgREST の order() は列しか並べ替えられず、post_tags の一致数という集計値では
-- 並べられないため DB 関数にした。security invoker のままにして posts/post_tags の RLS を通す。
-- status/deleted_at は posts_select_own（author_id 一致のみで status 等を見ない）が OR で
-- 合成されるため、ここでも明示的に絞る（lib/posts/post-list.ts の getPostList と同じ理由）。
-- published_at は NULL 許容列なので、toPostListItem の表示フォールバックに合わせて
-- coalesce(published_at, created_at) を並び順・カーソル双方の基準にする
--   docs/product/pending-items.md D24
-- ============================================

create or replace function public.recommended_post_ranks(
  p_tag_ids uuid[],
  p_cursor_match_count int default null,
  p_cursor_published_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 12
)
returns table (
  post_id uuid,
  match_count int,
  published_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with scored as (
    select
      p.id,
      coalesce(p.published_at, p.created_at) as published_at,
      count(pt.tag_id)::int as match_count
    from public.posts p
    join public.post_tags pt on pt.post_id = p.id and pt.tag_id = any(p_tag_ids)
    where p.status = 'published'
      and p.deleted_at is null
    group by p.id, p.published_at, p.created_at
  )
  select id, match_count, published_at
  from scored
  where p_cursor_match_count is null
    or match_count < p_cursor_match_count
    or (
      match_count = p_cursor_match_count
      and (
        published_at < p_cursor_published_at
        or (published_at = p_cursor_published_at and id < p_cursor_id)
      )
    )
  order by match_count desc, published_at desc, id desc
  limit p_limit
$$;

comment on function public.recommended_post_ranks(uuid[], int, timestamptz, uuid, int) is
  'S_HOME/S_EXPLORE「おすすめ」: 興味タグの一致数順（同数は新着順）に投稿IDを返す。RLSに認可を委譲するため security invoker';

-- おすすめタブはログイン済みユーザーの興味タグが前提（resolveFeedOptions 参照）。anon には不要
revoke execute on function public.recommended_post_ranks(uuid[], int, timestamptz, uuid, int) from public;
grant execute on function public.recommended_post_ranks(uuid[], int, timestamptz, uuid, int) to authenticated;
