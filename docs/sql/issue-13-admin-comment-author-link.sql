-- ユーザー管理用の SQL（issue-11-admin-users.sql と issue-11-admin-github-usernames.sql）のあとに実行する。
begin;

-- 1. 投稿者が載っているページを探し、そのページのユーザーを返す。
create or replace function public.admin_list_users_at_user(target_user_id uuid, page_size integer)
returns table (page_number integer, user_id uuid, email text, is_admin boolean, github_username text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  target_page integer;
begin
  -- ページの検索とメールアドレスを含む一覧の取得は管理者に限定する。
  if auth.uid() is null or public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;

  if page_size is null or page_size not between 1 and 50 then
    raise exception 'invalid_user_list_page' using errcode = '22023';
  end if;

  -- admin_list_users と同じ順序で、標準の一覧上のページを求める。
  select ((ordered_accounts.row_index - 1) / page_size)::integer
  into target_page
  from (
    select account.id,
           row_number() over (order by account.created_at desc nulls last, account.id) as row_index
    from auth.users as account
  ) as ordered_accounts
  where ordered_accounts.id = target_user_id;

  -- 投稿者のアカウントがなくなっている場合は空の結果を返す。
  if target_page is null then
    return;
  end if;

  -- 該当ページの取得は既存の関数に任せ、次のページの確認用に1件追加する。
  return query
    select target_page, users.*
    from public.admin_list_users(target_page * page_size, page_size + 1) as users;
end;
$function$;

-- 2. ログイン済みの利用者だけが関数を呼べるようにし、API に読み込ませる。
revoke all on function public.admin_list_users_at_user(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users_at_user(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
