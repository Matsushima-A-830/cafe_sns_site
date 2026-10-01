-- ============================================
-- nearby_cafes: 雰囲気（mood）・利用機会（occasion）タグでの絞り込みを追加
--
-- カフェに直接タグは付かず post_tags 経由で投稿に付くだけなので、
-- 「該当カテゴリのタグが付いた公開投稿を1件以上持つカフェ」を絞り込み条件にする。
-- security invoker のままなので posts_select の RLS（visibility / ブロック等）が
-- そのまま効き、非公開投稿はタグ一致の判定に使われない。
--
-- ただし posts_select_own（本人には status/deleted_at を問わず見せる permissive policy。
-- 20260910120000_fix_posts_select_own.sql）が RLS に OR 合成されるため、RLS だけに
-- 任せると「投稿者本人が自分の hidden/archived/削除済み投稿にタグを付けていた場合、
-- 本人だけその投稿を根拠にカフェがヒットしてしまう」。likes_select_visibility 等と同じく
-- status/deleted_at をここでも明示する
--   docs/product/pending-items.md D63 / docs/design/wireframes/browsing.md #S_MAP
-- ============================================

-- 引数を追加した新シグネチャは create or replace では既存関数を置き換えられず
-- （PostgreSQL は名前+引数型の組でオーバーロード扱いにするため）、旧シグネチャを
-- 明示的に drop してから作り直す
drop function if exists public.nearby_cafes(double precision, double precision, text, text, int);

create function public.nearby_cafes(
  p_lat double precision,
  p_lng double precision,
  p_area_code text default null,
  p_query text default null,
  p_limit int default 100,
  p_mood_tag text default null,
  p_occasion_tag text default null
)
returns table (
  cafe_id uuid,
  name text,
  area_code text,
  area_label text,
  lat double precision,
  lng double precision,
  distance_m double precision,
  is_verified boolean
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.name,
    c.area_code,
    a.label,
    extensions.st_y(c.location::extensions.geometry),
    extensions.st_x(c.location::extensions.geometry),
    extensions.st_distance(
      c.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    ),
    c.verified_owner_id is not null
  from public.cafes c
  left join public.areas a on a.code = c.area_code
  where c.location is not null
    and (p_area_code is null or c.area_code = p_area_code)
    and (p_query is null or position(lower(p_query) in lower(c.name)) > 0)
    and (
      p_mood_tag is null
      or exists (
        select 1
        from public.posts p
        join public.post_tags pt on pt.post_id = p.id
        join public.tags t on t.id = pt.tag_id
        where p.cafe_id = c.id
          and p.status = 'published' and p.deleted_at is null
          and t.category = 'mood' and t.slug = p_mood_tag
      )
    )
    and (
      p_occasion_tag is null
      or exists (
        select 1
        from public.posts p
        join public.post_tags pt on pt.post_id = p.id
        join public.tags t on t.id = pt.tag_id
        where p.cafe_id = c.id
          and p.status = 'published' and p.deleted_at is null
          and t.category = 'occasion' and t.slug = p_occasion_tag
      )
    )
  order by
    c.location operator(extensions.<->)
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  limit p_limit
$$;

comment on function public.nearby_cafes(double precision, double precision, text, text, int, text, text) is
  'S_MAP: 座標のあるカフェを閲覧者位置からの距離順に返す。area_code/query に加え、mood/occasion タグが
   付いた公開投稿を持つカフェへの絞り込みに対応。RLSに認可を委譲するため security invoker';

revoke execute on function public.nearby_cafes(double precision, double precision, text, text, int, text, text) from public;
grant execute on function public.nearby_cafes(double precision, double precision, text, text, int, text, text) to anon, authenticated;
