-- ============================================
-- finalize_post: reservePost が作った hidden 予約行を、本文・タグ・画像込みで
-- 公開確定させる RPC。app/_actions/posts.ts createPost はこの関数を1回呼ぶだけになる。
--
-- 背景: 手動ロールバック方式（本文 UPDATE → post_images/post_tags insert →
-- status UPDATE を別々の Postgres 文として実行し、失敗時にアプリ側で取り消す）には、
-- 別々のリクエスト同士を補償処理で整合させようとする構造的な限界があった。
-- 同じ postId への二重送信で、双方が「本文 UPDATE（status='hidden'条件）」を通過した
-- 後に post_images/post_tags の insert が絡み合うと、どちらも publish まで進めず
-- 画像・タグだけ入った hidden 投稿のまま行き詰まり、再送しても同じ一意制約違反で
-- 抜け出せなくなるケースがあった（docs/product/pending-items.md D17 参照）。
--
-- 対応: 本文確定・画像/タグ追加・公開更新を1つの関数（＝1トランザクション）に
-- まとめ、冒頭で対象行を `SELECT ... FOR UPDATE` によりロックする。同じ postId への
-- 同時呼び出しは後着がロック解放まで待たされ、解放後に WHERE を再評価するため
-- （Postgres の EvalPlanQual）、先着が成功していれば後着は対象0件 → FORBIDDEN、
-- 先着が失敗（例外で自動ロールバック）していれば後着はそのまま正常に進める。
-- 手動の rollbackFinalizeInserts や CONFLICT 分岐が不要になり、行き詰まりが
-- 構造的に起こらなくなる
--
-- security invoker にする理由: RLS（posts_select_own / posts_update_own /
-- post_images_insert_own / post_tags_insert_own / is_active_user()）をそのまま
-- 効かせるため。認可をこの関数の中で作り直さない
-- ============================================

create or replace function public.finalize_post(
  p_post_id uuid,
  p_post_type text,
  p_title text,
  p_body_json jsonb,
  p_visibility text,
  p_cafe_id uuid,
  p_image_paths text[],
  p_tag_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_locked_id uuid;
  v_path text;
  v_tag_id uuid;
  v_display_order smallint := 0;
begin
  -- 対象行をロックして同じ postId への同時 finalize を1本に絞る。他人の postId・
  -- 既に finalize 済み（status<>'hidden'）・予約時と異なる post_type はどれも
  -- ここで対象0件になる（posts_select_own が author_id 一致なら status 不問で
  -- 見せるため、これは RLS の欠落ではなく WHERE 条件による意図的な絞り込み）
  select id into v_locked_id
  from public.posts
  where id = p_post_id and status = 'hidden' and post_type = p_post_type
  for update;

  if v_locked_id is null then
    raise exception 'FORBIDDEN';
  end if;

  update public.posts
  set
    cafe_id = p_cafe_id,
    title = p_title,
    body_json = p_body_json,
    visibility = p_visibility
  where id = p_post_id;

  if p_image_paths is not null then
    foreach v_path in array p_image_paths loop
      insert into public.post_images (post_id, storage_path, display_order)
      values (p_post_id, v_path, v_display_order);
      v_display_order := v_display_order + 1;
    end loop;
  end if;

  if p_tag_ids is not null then
    foreach v_tag_id in array p_tag_ids loop
      insert into public.post_tags (post_id, tag_id)
      values (p_post_id, v_tag_id);
    end loop;
  end if;

  update public.posts set status = 'published' where id = p_post_id;
end;
$$;

comment on function public.finalize_post(uuid, text, text, jsonb, text, uuid, text[], uuid[]) is
  'reservePost が作った hidden 予約行を本文/タグ/画像込みで公開確定させる。
   FOR UPDATE の行ロックで同じ postId への同時呼び出しを直列化し、手動ロールバックに
   頼らず失敗時は関数全体（1トランザクション）が自動で巻き戻る。
   docs/product/pending-items.md D17';

-- anon には無意味（posts_select_own が author_id 一致を要求するため常に FORBIDDEN）
-- だが、authenticated からのみ呼べれば十分なので anon には付与しない
revoke execute on function public.finalize_post(uuid, text, text, jsonb, text, uuid, text[], uuid[]) from public;
grant execute on function public.finalize_post(uuid, text, text, jsonb, text, uuid, text[], uuid[]) to authenticated;
