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
-- award_badge: バッジ付与 + 通知をまとめる security definer RPC
--
-- 設計docの擬似コード（README.md #バッジ付与ロジックの設計）はユーザークライアントで
-- 直接 user_badges / notifications に INSERT する想定だが、両テーブルとも
-- ユーザー向け INSERT ポリシーが無いため RLS で弾かれる（tables.md #user_badges:
-- 「INSERT はシステム（admin）のみ」。notifications も badge 型は INSERT ポリシー対象外）。
-- notify_on_like 等と同じ理由で security definer 関数に一元化する。
--
-- トリガーではなく RPC にする理由: バッジ判定（lib/badges/check.ts）は
-- Server Actions 側の TypeScript で行う設計（README.md 参照）であり、DB 側で
-- 判定条件を持たない。判定済みの1件を確定させるだけの薄い関数にする
--
-- 冪等性: user_badges は (user_id, badge_id) が PK なので ON CONFLICT DO NOTHING。
-- 既に獲得済みの再呼び出しでは notifications を重複作成しない（挿入できた時だけ通知する）
--
-- p_user_id は必ずしも auth.uid() と一致しない: REGULAR_AWARDED（app/_actions/
-- regular-customers.ts、オーナーが呼ぶ）・LIKE_RECEIVED / FOLLOW_RECEIVED（app/_actions/
-- likes.ts・follows.ts、行為者が呼ぶ）は「バッジを受け取る本人」と「呼び出しセッション」
-- が別人になる（docs/seed/badges-initial-set.md #判定タイミング）。この3種
-- （regular_customer_count / likes_received / follower_count）は auth.uid() 一致を要求せず、
-- 代わりに実データを再集計して閾値を満たすかをこの関数内で検証する
-- （呼び出し元の checkAndAwardBadges の判定を信用しない。他人に未達のバッジを付与させない）。
-- それ以外の type（本人操作でのみ発火する post_count 系）は従来どおり auth.uid() 一致を要求する
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
  v_type text;
  v_threshold numeric;
  v_actual_count int;
  v_row_count int;
begin
  select id, criteria into v_badge_id, v_criteria from public.badges where code = p_badge_code;
  if v_badge_id is null then
    raise exception 'BADGE_NOT_FOUND';
  end if;

  if p_user_id = (select auth.uid()) then
    -- 本人が自分の実績で呼ぶ経路。checkAndAwardBadges が本人の RLS スコープで
    -- 既に実データを集計済みなのでここでは再検証しない
    null;
  else
    v_type := v_criteria ->> 'type';
    v_threshold := (v_criteria ->> 'threshold')::numeric;

    if v_type = 'regular_customer_count' then
      select count(*) into v_actual_count
      from public.regular_customers
      where user_id = p_user_id and revoked_at is null;
    elsif v_type = 'likes_received' then
      select count(*) into v_actual_count
      from public.likes l
      join public.posts p on p.id = l.post_id
      where p.author_id = p_user_id;
    elsif v_type = 'follower_count' then
      select count(*) into v_actual_count
      from public.follows
      where followee_id = p_user_id;
    else
      -- 上記3種以外は他人が代理で付与できる経路を持たない
      raise exception 'FORBIDDEN';
    end if;

    if v_actual_count < v_threshold then
      raise exception 'FORBIDDEN';
    end if;
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
  'lib/badges/check.ts の checkAndAwardBadges から呼ぶ。既に条件を満たすと判断された
   1バッジぶんを user_badges に確定し、新規獲得の時だけ通知を作る。p_user_id が
   auth.uid() と異なる（REGULAR_AWARDED/LIKE_RECEIVED/FOLLOW_RECEIVED 経由）場合のみ
   regular_customer_count/likes_received/follower_count を実データで再検証する';

-- anon には無意味（auth.uid() が null になり常に FORBIDDEN）だが authenticated のみに絞る
revoke execute on function public.award_badge(uuid, text) from public;
grant execute on function public.award_badge(uuid, text) to authenticated;
