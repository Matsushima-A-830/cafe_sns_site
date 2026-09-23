-- ============================================
-- user_badges / area_visits: S_BADGES（バッジ一覧・制覇マップ）のデータ層
--
--   docs/architecture/data-model/tables.md #user_badges #area_visits
--   docs/architecture/data-model/README.md #バッジ付与ロジックの設計 #エリアコードの一貫性
-- ============================================

create table public.user_badges (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  badge_id    uuid not null references public.badges (id) on delete cascade,
  awarded_at  timestamptz not null default now(),
  context     jsonb,

  primary key (user_id, badge_id)
);

comment on table public.user_badges is
  'ユーザーが獲得したバッジ。INSERT は award_badge() 経由のみ（RLSでは直接許可しない）。
   docs/architecture/data-model/tables.md #user_badges';

-- S_BADGES バッジ一覧（獲得順）
create index user_badges_user_awarded_idx
  on public.user_badges (user_id, awarded_at desc);

alter table public.user_badges enable row level security;

create policy user_badges_select_all
  on public.user_badges for select
  to anon, authenticated
  using (true);

-- INSERT ポリシーは置かない。award_badge() の security definer 経由のみに閉じる
-- （tables.md: 「他の type は security definer トリガー経由で RLS をバイパスする」と同じ思想）

create table public.area_visits (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  area_code         text not null references public.areas (code) on delete cascade,
  first_visited_at  timestamptz not null,
  last_visited_at   timestamptz not null,
  visit_count       int not null default 1,

  primary key (user_id, area_code)
);

comment on table public.area_visits is
  '制覇マップ用のエリア訪問実績。record_area_visit() トリガーが投稿公開時に自エリア+親エリアを upsert する。
   docs/architecture/data-model/tables.md #area_visits';

-- S_BADGES 制覇マップ（ユーザー別のエリア一覧）
create index area_visits_user_idx
  on public.area_visits (user_id);

alter table public.area_visits enable row level security;

create policy area_visits_select_all
  on public.area_visits for select
  to anon, authenticated
  using (true);

-- INSERT / UPDATE ポリシーは置かない。record_area_visit() の security definer 経由のみ

-- ============================================
-- record_area_visit: posts が published になった時に自エリア + 親エリアを upsert する
--
-- docs/architecture/data-model/README.md #エリアコードの一貫性 の確定SQLそのまま
-- （search_path のみ他の security definer 関数と揃えて空文字に設定する）
-- ============================================

create or replace function public.record_area_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  visited_at timestamptz := coalesce(new.published_at, new.created_at, now());
begin
  insert into public.area_visits (user_id, area_code, first_visited_at, last_visited_at, visit_count)
  select new.author_id, t.code, visited_at, visited_at, 1
  from public.cafes c
  join public.areas a on a.code = c.area_code
  cross join lateral (values (a.code), (a.parent_code)) as t(code)
  where c.id = new.cafe_id and t.code is not null
  on conflict (user_id, area_code) do update
    set visit_count      = area_visits.visit_count + 1,
        last_visited_at  = greatest(area_visits.last_visited_at, excluded.last_visited_at);
  return null;
end;
$$;

comment on function public.record_area_visit() is
  '投稿が published になった時、自エリア＋親エリア（区）の訪問実績を upsert する。
   副地域への投稿は親の区も同時に訪問済みにする（さもないと「東京23区制覇」系バッジが
   永久に達成できない）。docs/architecture/data-model/README.md #エリアコードの一貫性';

-- 「公開になった瞬間」だけ発火させる（下書き相当・非公開・論理削除は計上しない）。
-- archived → published の復帰も対象にするため status の UPDATE も監視する
-- （同一投稿の再公開で visit_count が二重に増えるのは許容する。README.md 参照）
create trigger posts_record_area_visit
  after insert or update of status on public.posts
  for each row
  when (new.status = 'published' and new.deleted_at is null and new.cafe_id is not null)
  execute function public.record_area_visit();

-- ============================================
-- badge_criteria_met: badges.criteria を実データに照らして判定する（award_badge から使う）
--
-- lib/badges/rules.ts の evaluateCriteria と同じ9種の判定を SQL 側にも持つ
-- （`/code-review` で指摘: award_badge が「呼び出しセッション = p_user_id」の時だけ
-- 検証を省略していたため、award_badge RPC を直接叩けば任意の未達バッジを自分に
-- 付与できてしまっていた。checkAndAwardBadges 経由という前提を信用せず、
-- award_badge 自身が唯一の権威ある判定にする）。
--
-- RLS をバイパスする理由は count_likes_received と同じ: 呼び出しセッションの
-- 可視範囲（フォロー関係・ブロック等）に判定結果を左右させないため
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
    select count(*) into v_actual from public.likes where user_id = p_user_id;

  else
    return false;
  end if;

  return v_actual >= v_threshold;
end;
$$;

comment on function public.badge_criteria_met(uuid, jsonb) is
  'award_badge の唯一の権威ある判定。lib/badges/rules.ts の evaluateCriteria と同じ
   9種の criteria.type を、呼び出しセッションの RLS 可視範囲に関係なく実データで判定する';

-- ============================================
-- award_badge: バッジ付与 + 通知をまとめる security definer RPC
--
-- 設計docの擬似コード（README.md #バッジ付与ロジックの設計）はユーザークライアントで
-- 直接 user_badges / notifications に INSERT する想定だが、両テーブルとも
-- ユーザー向け INSERT ポリシーが無いため RLS で弾かれる（tables.md #user_badges:
-- 「INSERT はシステム（admin）のみ」。notifications も badge 型は INSERT ポリシー対象外）。
-- notify_on_like 等と同じ理由で security definer 関数に一元化する。
--
-- badge_criteria_met で毎回実データを検証するため、p_user_id と呼び出しセッション
-- （auth.uid()）が一致するかどうかは問わない。lib/badges/check.ts の判定は
-- 「候補を絞って無駄な RPC 呼び出しを避けるための事前フィルタ」にすぎず、
-- 権威ある認可はこの関数（および badge_criteria_met）が担う
--
-- 冪等性: user_badges は (user_id, badge_id) が PK なので ON CONFLICT DO NOTHING。
-- 既に獲得済みの再呼び出しでは notifications を重複作成しない（挿入できた時だけ通知する）
-- ============================================

create or replace function public.award_badge(p_user_id uuid, p_badge_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_badge_id uuid;
  v_criteria jsonb;
  v_row_count int;
begin
  select id, criteria into v_badge_id, v_criteria from public.badges where code = p_badge_code;
  if v_badge_id is null then
    raise exception 'BADGE_NOT_FOUND';
  end if;

  if not public.badge_criteria_met(p_user_id, v_criteria) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.user_badges (user_id, badge_id)
  values (p_user_id, v_badge_id)
  on conflict (user_id, badge_id) do nothing;

  get diagnostics v_row_count = row_count;

  if v_row_count > 0 then
    insert into public.notifications (recipient_id, type, entity_type, entity_id)
    values (p_user_id, 'badge', 'badge', v_badge_id);
  end if;
end;
$$;

comment on function public.award_badge(uuid, text) is
  'lib/badges/check.ts の checkAndAwardBadges から呼ぶ。badge_criteria_met で実データを
   検証してから user_badges に確定し、新規獲得の時だけ通知を作る。p_user_id が
   auth.uid() と異なっていても（REGULAR_AWARDED/LIKE_RECEIVED/FOLLOW_RECEIVED 経由）、
   直接叩かれても（`/code-review` 指摘）、常に実データで検証するため未達の付与はできない';

-- ============================================
-- count_likes_received: lib/badges/rules.ts の likes_received 判定用
--
-- likes 自体は likes_select_all で誰からも見えるが、likes.post_id を posts に
-- JOIN すると posts_select（visibility='followers' は作者本人・フォロワーのみ）が
-- 効き、フォロワーではない「いいねした人」のセッションで集計すると
-- 非公開投稿ぶんのいいねが数えられず過小評価になる
-- （`/code-review` で指摘。COM_100_LIKES が閾値到達後も永久に付与されなくなる）。
-- award_badge 内の再検証（p_user_id <> auth.uid() のときだけ実行）は正しい値を見るが、
-- そこに辿り着く前に checkAndAwardBadges 側の evaluateCriteria が過小評価で false を
-- 返すと award_badge 自体が呼ばれない。RLS を経由しない集計専用の関数に切り出す
-- ============================================

create or replace function public.count_likes_received(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.likes l
  join public.posts p on p.id = l.post_id
  where p.author_id = p_user_id and p.status = 'published' and p.deleted_at is null;
$$;

comment on function public.count_likes_received(uuid) is
  'lib/badges/rules.ts の likes_received 判定用。RLS（posts_select の visibility 制限）を
   バイパスして、呼び出しセッションの可視範囲に関係なく実際の受け取りいいね数を返す';

revoke execute on function public.count_likes_received(uuid) from public;
grant execute on function public.count_likes_received(uuid) to anon, authenticated;

-- anon には無意味（auth.uid() が null になり常に FORBIDDEN）だが authenticated のみに絞る
revoke execute on function public.award_badge(uuid, text) from public;
grant execute on function public.award_badge(uuid, text) to authenticated;
