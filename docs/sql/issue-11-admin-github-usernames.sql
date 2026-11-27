-- issue-11-admin-users.sql の適用後、SQL Editor でこのファイル全体をまとめて実行する。
begin;

-- 1. 一覧に GitHub ユーザー名の列を追加するため、同じ名前で関数を作り直す。
drop function if exists public.admin_list_users(integer, integer);

create function public.admin_list_users(page_offset integer, page_limit integer)
returns table (user_id uuid, email text, is_admin boolean, github_username text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  -- アカウントの識別情報を返す前に、ログイン中の人が管理者か確認する。
  if public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;

  -- 画面の50件と次ページ確認用の1件までに制限する。
  if page_offset is null or page_offset < 0
     or page_limit is null or page_limit not between 1 and 51 then
    raise exception 'invalid_user_list_page' using errcode = '22023';
  end if;

  return query
    select account.id, account.email::text,
           exists (
             select 1 from public.map_administrators as admin
             where admin.user_id = account.id
           ),
           -- Supabase が GitHub 連携時に保存したログイン名を返す。
           (
             select coalesce(
               nullif(btrim(github.identity_data ->> 'preferred_username'), ''),
               nullif(btrim(github.identity_data ->> 'user_name'), '')
             )
             from auth.identities as github
             where github.user_id = account.id and github.provider = 'github'
             order by github.created_at desc nulls last, github.id
             limit 1
           )
    from auth.users as account
    order by account.created_at desc nulls last, account.id
    limit page_limit offset page_offset;
end;
$function$;

-- 2. 作り直した関数にも実行権限を設定し、Supabase の API に読み込ませる。
revoke all on function public.admin_list_users(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(integer, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
