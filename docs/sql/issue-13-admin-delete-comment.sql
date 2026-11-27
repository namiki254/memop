-- issue-13-admin-comments.sql の適用後、Supabase の SQL Editor で全体を実行する。
begin;

-- 1. 管理用一覧またはピンの詳細パネルで選んだコメントを1件削除する。
create or replace function public.admin_delete_pin_comment(target_comment_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  comment_id public.pin_comments.id%type;
begin
  -- 投稿者向けの既存の削除ルールとは別に、ここでは管理者の操作だけを許可する。
  if public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;

  -- アプリからはIDを文字列で受け取り、削除時はテーブルのIDと同じ型で比較する。
  comment_id := target_comment_id;
  delete from public.pin_comments as comment
  where comment.id = comment_id;

  -- 別の人が先に削除していた場合は false を返し、画面で一覧を更新する。
  return found;
end;
$function$;

-- 2. ログイン済みの利用者に呼び出しを許可し、関数内で管理者か判断する。
revoke all on function public.admin_delete_pin_comment(text) from public, anon, authenticated;
grant execute on function public.admin_delete_pin_comment(text) to authenticated;
notify pgrst, 'reload schema';
commit;
