-- Supabase の SQL Editor にこのファイル全体を貼り、上からまとめて実行する。
-- 関数の作成と実行権限の設定を、すべて成功したときだけ反映する。
begin;

-- 1. ログイン中の人が管理者の場合だけ、ユーザーの識別情報と現在の権限を返す。
create or replace function public.admin_list_users(page_offset integer, page_limit integer)
returns table (user_id uuid, email text, is_admin boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
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
           )
    from auth.users as account
    order by account.created_at desc nulls last, account.id
    limit page_limit offset page_offset;
end;
$function$;

-- 2. 既存の is_map_admin() が参照するテーブルを更新する。
create or replace function public.admin_set_map_admin(target_user_id uuid, make_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- 操作した人はログイン情報で判定し、ブラウザから受け取るIDは変更先だけにする。
  if public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;

  if target_user_id is null or make_admin is null then
    raise exception 'invalid_map_admin_change' using errcode = '22023';
  end if;

  -- 付与・解除を1件ずつ処理する。同時に複数の解除が来ても最後の管理者を残す。
  lock table public.map_administrators in share row exclusive mode;

  -- ロックを待っている間に、操作した人の権限が解除された可能性がある。
  if public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users as account where account.id = target_user_id) then
    raise exception 'map_admin_target_not_found' using errcode = 'P0002';
  end if;

  if make_admin then
    -- 同じ付与が再送されても、管理者の行は重複して登録しない。
    insert into public.map_administrators (user_id)
    select target_user_id
    where not exists (
      select 1 from public.map_administrators as admin
      where admin.user_id = target_user_id
    );
  else
    if not exists (
      select 1
      from public.map_administrators as admin
      join auth.users as account on account.id = admin.user_id
      where admin.user_id <> target_user_id
    ) then
      raise exception 'last_map_admin' using errcode = '23514';
    end if;

    delete from public.map_administrators as admin
    where admin.user_id = target_user_id;
  end if;
end;
$function$;

-- 3. ブラウザから管理者テーブルを直接読み書きできないようにする。
-- 関数はログイン済みユーザーに限って呼び出せるようにし、関数内でも管理者か確認する。
revoke all privileges on table public.map_administrators from public, anon, authenticated;
revoke all privileges (user_id) on table public.map_administrators from public, anon, authenticated;

revoke all on function public.admin_list_users(integer, integer) from public, anon, authenticated;
revoke all on function public.admin_set_map_admin(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_list_users(integer, integer) to authenticated;
grant execute on function public.admin_set_map_admin(uuid, boolean) to authenticated;

-- 4. Supabase の API に追加した関数を読み込ませる。
notify pgrst, 'reload schema';
commit;
