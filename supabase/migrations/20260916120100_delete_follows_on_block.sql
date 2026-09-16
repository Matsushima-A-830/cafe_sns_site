-- ブロックしたら既存のフォロー関係を両方向とも切る
--
-- 20260916120000 で follows_insert_own に followee 側のガードを足したが、あれは INSERT 時の
-- 判定でしかない。「A が B をフォロー → あとから A が B をブロック」では follows の行が
-- 残り続ける。posts_select が投稿を隠すのでフィードには出ないが、follows_select_all は
-- using (true) なのでフォロー数・フォロワー数には数え続け、ブロックを解除すると
-- 切ったはずのフォローが復活する（pending-items.md D29）。
--
-- blocks の INSERT で両方向の follows を消してしまい、「ブロック中のペアに follows 行は
-- 存在しない」という不変条件を時間方向にも保つ。

create or replace function public.delete_follows_on_block()
returns trigger
language plpgsql
-- follows の RLS（follows_delete_own = 自分のフォローのみ）をバイパスする必要がある。
-- 相手が自分をフォローしている行はブロックした本人には消せないため
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;

comment on function public.delete_follows_on_block() is
  'ブロック成立時に両方向のフォローを解除する。follows の RLS をバイパスするため security definer';

create trigger blocks_delete_follows
  after insert on public.blocks
  for each row execute function public.delete_follows_on_block();
