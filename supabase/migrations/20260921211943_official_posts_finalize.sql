-- ============================================
-- 公式投稿（S_POST_OFFICIAL, 幹C-2）の finalize RPC と通知 fan-out
--
-- finalize_post（20260911134931）は is_official 系パラメータを一切受け取らず、
-- 公式投稿の保存に流用できない。一般投稿フローへの影響をゼロにするため、
-- 公式投稿専用の finalize_official_post を新設する（引き継ぎドキュメント 要判断①）。
--
-- reserveOfficialPost（app/_actions/posts-official.ts）が is_official=true /
-- official_format / cafe_id を確定させた状態で hidden 行を先に insert し、
-- この関数は title / body_json / metadata の確定と画像追加・公開化のみを担う
-- （is_official・cafe_id・author_id は finalize 時点で変更しない —
-- posts_guard_official_owner トリガーの対象列にも触れないため再発火しない）。
--   docs/architecture/data-model/tables.md #posts, #metadataのスキーマ公式投稿
-- ============================================

create or replace function public.finalize_official_post(
  p_post_id uuid,
  p_official_format text,
  p_title text,
  p_body_json jsonb,
  p_metadata jsonb,
  p_image_paths text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_locked_id uuid;
  v_path text;
  v_display_order smallint := 0;
begin
  -- finalize_post が post_type を対象条件に含めるのと同じ理由（同じ考え方）。
  -- official_format も対象条件に含めないと、closure として予約した postId に
  -- tip 用のペイロード（title/bodyJson等）を送って finalize できてしまい、
  -- official_format='closure' なのに tip 形式の本文が入るような不整合が起こる
  select id into v_locked_id
  from public.posts
  where id = p_post_id
    and status = 'hidden'
    and is_official = true
    and official_format = p_official_format
  for update;

  if v_locked_id is null then
    raise exception 'FORBIDDEN';
  end if;

  update public.posts
  set title = p_title, body_json = p_body_json, metadata = p_metadata
  where id = p_post_id;

  if p_image_paths is not null then
    foreach v_path in array p_image_paths loop
      insert into public.post_images (post_id, storage_path, display_order)
      values (p_post_id, v_path, v_display_order);
      v_display_order := v_display_order + 1;
    end loop;
  end if;

  update public.posts set status = 'published' where id = p_post_id;
end;
$$;

comment on function public.finalize_official_post(uuid, text, text, jsonb, jsonb, text[]) is
  'reserveOfficialPost が作った hidden 予約行（is_official=true）を、タイトル/本文/
   metadata/画像込みで公開確定させる。finalize_post と同じ FOR UPDATE ロック方式。
   p_official_format は予約時の official_format と一致しないと対象0件になる
   （closure で予約した postId に tip のペイロードを送るような不整合を防ぐ）。
   docs/design/wireframes/composer.md #S_POST_OFFICIAL';

revoke execute on function public.finalize_official_post(uuid, text, text, jsonb, jsonb, text[]) from public;
grant execute on function public.finalize_official_post(uuid, text, text, jsonb, jsonb, text[]) to authenticated;

-- ============================================
-- notify_on_official_post: 公式投稿の公開 → 「お気に入り」「行きたい」ユーザーへの通知
--
-- notifications.type='official_post' は tables.md の定義上「ユーザーが切れない重要通知」
-- （user_settings のトグルで抑制しない）。likes/comments/follows の notify_on_* と違い、
-- 宛先が複数（1カフェにつき N 人）になる初めてのケースのため、対象ユーザー数に上限を設ける
-- （引き継ぎドキュメント 要判断②）。人気カフェで一括 INSERT が重くなるのを避ける目的で
-- 「直近に list に入れた1000人」に絞る。1000人を超えるカフェの網羅通知は
-- フェーズ2で別の配信基盤（バッチ・キュー）を検討する
--   docs/architecture/data-model/tables.md #notifications
--   docs/design/wireframes/composer.md #S_POST_OFFICIAL 実装メモ
--
-- security definer にする理由: notifications に INSERT ポリシーが無く（recipient 以外
-- 宛ての行を作る必要があるため）、user_cafe_lists の SELECT RLS も本人限定
-- （user_cafe_lists_select_own）なので、どちらも RLS をバイパスしないと fan-out できない
-- ============================================

create or replace function public.notify_on_official_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- INSERT/UPDATE 両方でこのトリガーは発火し得るが「hidden → published への遷移」
  -- （finalize_official_post による公開）のときだけ通知する。一般投稿には無関係
  if not new.is_official then
    return new;
  end if;
  if new.status <> 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id)
  select l.user_id, new.author_id, 'official_post', 'post', new.id
  from public.user_cafe_lists l
  where l.cafe_id = new.cafe_id
    and l.user_id <> new.author_id
    and not public.is_blocked_either_way(l.user_id)
  group by l.user_id
  order by max(l.created_at) desc
  limit 1000;

  return new;
end;
$$;

comment on function public.notify_on_official_post() is
  '公式投稿が公開された（status が published に遷移した）とき、当該カフェを
   favorite/want_to_go に入れているユーザーへ通知する。GROUP BY で「両方のリストに
   入れている」ユーザーへの二重送信を防ぎ、直近に追加した1000人までに絞る
   （docs/product/pending-items.md 参照・要判断②）';

create trigger posts_notify_on_official_post
  after insert or update of status on public.posts
  for each row execute function public.notify_on_official_post();
