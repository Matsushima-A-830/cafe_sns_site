-- status が active から外れたら follows を両方向とも切る
--
-- follows_insert_own は INSERT 時にしか相手の status を見ないため、「フォロー後に相手が
-- 停止・削除された」ケースでは follows 行が残り続け、getProfileCounts のフォロー数・
-- フォロワー数が停止/削除ユーザーを数え続けてしまう（pending-items.md D29 対応案 d）。
--
-- delete_follows_on_block と同じ理由で security definer が必須: follows_delete_own は
-- 「自分の行」しか消せないため、停止された本人・相手双方が消せない行が出る。
create or replace function public.delete_follows_on_profile_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where follower_id = new.id or followee_id = new.id;
  return new;
end;
$$;

comment on function public.delete_follows_on_profile_inactive() is
  'プロフィールが active から外れたら両方向のフォローを解除する。follows の RLS をバイパスするため security definer';

-- profiles_guard_privileged_columns（before update）が status の変更権限を先に検証する。
-- 値確定後の after update で、active からの離脱だけに絞って発火させる
create trigger profiles_delete_follows_on_inactive
  after update of status on public.profiles
  for each row
  when (old.status = 'active' and new.status is distinct from 'active')
  execute function public.delete_follows_on_profile_inactive();

-- バックフィル: このマイグレーション適用前に既に active から外れていたプロフィール
-- （admin-reports.ts の suspend_user 等）の follows は上のトリガーの対象外のため、
-- 既存データも一度だけ掃除する
delete from public.follows
using public.profiles
where (public.follows.follower_id = public.profiles.id or public.follows.followee_id = public.profiles.id)
  and public.profiles.status <> 'active';
