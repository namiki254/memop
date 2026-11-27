-- is_map_admin() がある Supabase プロジェクトの SQL Editor で全体を実行する。
-- 変更は全体が成功したときだけ反映される。
begin;

-- 1. 管理者向けに、全フォルダを新しい順に返す。
create or replace function public.admin_list_folders(page_offset integer, page_limit integer)
returns table (
  id uuid, name text, user_id uuid, parent_folder_id uuid, parent_name text
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  if auth.uid() is null or public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;
  if page_offset is null or page_offset < 0
     or page_limit is null or page_limit not between 1 and 51 then
    raise exception 'invalid_folder_page' using errcode = '22023';
  end if;

  return query
    select folder.id, folder.name::text, folder.user_id, folder.parent_folder_id, parent.name::text
    from public.folders as folder
    left join public.folders as parent on parent.id = folder.parent_folder_id
    order by folder.created_at desc nulls last, folder.id
    limit page_limit offset page_offset;
end;
$function$;

-- 2. 名前の変更は作成者本人と管理者に限定し、元の作成者と階層を保持する。
create or replace function public.rename_folder(
  target_folder_id uuid, expected_name text, new_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  editor_id uuid := auth.uid();
  trimmed_name text;
  updated_folder public.folders%rowtype;
begin
  if editor_id is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  trimmed_name := regexp_replace(new_name, '^[[:space:]　]+|[[:space:]　]+$', '', 'g');
  if trimmed_name is null or trimmed_name = '' or char_length(trimmed_name) > 100 then
    raise exception 'invalid_folder_name' using errcode = '22023';
  end if;

  -- 編集中に他の人が名前を変更していたら、先の変更を上書きしない。
  update public.folders as folder
  set name = trimmed_name
  where folder.id = target_folder_id
    and (folder.user_id = editor_id or public.is_map_admin())
    and folder.name is not distinct from expected_name
  returning folder.* into updated_folder;

  if not found then
    return null;
  end if;
  return to_jsonb(updated_folder);
end;
$function$;

-- 3. フォルダを削除し、中のマップと直下の子フォルダを親の階層に移す。
create or replace function public.delete_folder(
  target_folder_id uuid, expected_parent_folder_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  editor_id uuid := auth.uid();
  target_folder public.folders%rowtype;
begin
  if editor_id is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;

  -- 削除と同時に中身が追加・移動されても、移動漏れや連鎖削除が起きないようにする。
  -- ロックはこの処理が終わると解除される。
  lock table public.folders, public.maps in share row exclusive mode;

  select * into target_folder from public.folders where id = target_folder_id;
  if not found then
    return false;
  end if;

  -- 持ち主なしのフォルダは、既存の仕様に合わせてログイン済みユーザーに許可する。
  if target_folder.user_id is not null and target_folder.user_id <> editor_id
     and public.is_map_admin() is distinct from true then
    raise exception 'folder_management_required' using errcode = '42501';
  end if;
  -- 確認後に移動先が変わっていたら、移動先をもう一度確認してもらう。
  if target_folder.parent_folder_id is distinct from expected_parent_folder_id then
    raise exception 'folder_parent_changed' using errcode = '40001';
  end if;

  -- 既存データの親子関係に循環がある場合は、中身を移す前に停止する。
  if exists (
    with recursive ancestors as (
      select folder.id, folder.parent_folder_id
      from public.folders as folder where folder.id = target_folder.parent_folder_id
      union
      select parent.id, parent.parent_folder_id
      from public.folders as parent join ancestors on parent.id = ancestors.parent_folder_id
    )
    select 1 from ancestors where id = target_folder.id
  ) then
    raise exception 'invalid_folder_hierarchy' using errcode = '23514';
  end if;

  update public.maps set folder_id = target_folder.parent_folder_id
    where folder_id = target_folder.id;
  update public.folders set parent_folder_id = target_folder.parent_folder_id
    where parent_folder_id = target_folder.id;

  -- このフォルダに付いた保存・お気に入りの記録も削除する。
  delete from public.saved_folders where folder_id = target_folder.id;
  delete from public.folder_favorites where folder_id = target_folder.id;
  delete from public.folders where id = target_folder.id;
  return true;
end;
$function$;

-- 4. 管理用一覧に載っている作成者の GitHub ユーザー名をまとめて取得する。
create or replace function public.admin_get_usernames(target_user_ids uuid[])
returns table (user_id uuid, github_username text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  -- 認証テーブルにある情報を取得する前に、操作した人が管理者か確認する。
  if auth.uid() is null or public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;
  if target_user_ids is null or cardinality(target_user_ids) > 51 then
    raise exception 'invalid_user_ids' using errcode = '22023';
  end if;

  return query
    select account.id, (
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
    where account.id = any(target_user_ids);
end;
$function$;

-- 5. 新しい操作は関数を通し、関数内で操作した人の権限を確認する。
-- folders の既存の RLS も、引き続き作成者本人の直接操作を制限する。
revoke all on function public.admin_list_folders(integer, integer) from public, anon, authenticated;
revoke all on function public.rename_folder(uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_folder(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_get_usernames(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_list_folders(integer, integer) to authenticated;
grant execute on function public.rename_folder(uuid, text, text) to authenticated;
grant execute on function public.delete_folder(uuid, uuid) to authenticated;
grant execute on function public.admin_get_usernames(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
