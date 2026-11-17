-- is_map_admin() がある Supabase プロジェクトの SQL Editor で全体を実行する。
begin;

-- 1. 管理者が一覧から非公開マップのピンを開いたときも、コメントを読めるようにする。
drop policy if exists "Map admins can read pin comments" on public.pin_comments;
create policy "Map admins can read pin comments" on public.pin_comments
  for select to authenticated
  using ((select public.is_map_admin()));

-- 2. 一覧に必要なコメント、投稿先、公開状態だけを新しい順に返す。
create or replace function public.admin_list_pin_comments(page_offset integer, page_limit integer)
returns table (
  comment_id text,
  content text,
  user_id text,
  creator_username text,
  created_at public.pin_comments.created_at%type,
  pin_id text,
  pin_title text,
  map_id text,
  map_title text,
  is_public boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  -- 通常のコメント閲覧が可能な人でも、全マップの管理用一覧は取得できない。
  if public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;

  -- 画面の50件と次ページ確認用の1件まで取得する。
  if page_offset is null or page_offset < 0
     or page_limit is null or page_limit not between 1 and 51 then
    raise exception 'invalid_comment_list_page' using errcode = '22023';
  end if;

  -- 日時が同じ投稿も、IDを使ってページ間の並び順を決める。
  return query
    select comment.id::text, comment.content::text, comment.user_id::text,
           comment.creator_username::text, comment.created_at,
           pin.id::text, pin.title::text, map.id::text, map.title::text, map.is_public
    from public.pin_comments as comment
    join public.pins as pin on pin.id = comment.pin_id
    join public.maps as map on map.id = pin.map_id
    order by comment.created_at desc nulls last, comment.id desc
    limit page_limit offset page_offset;
end;
$function$;

-- 3. ログイン済みの利用者だけが関数を呼べるようにし、API に読み込ませる。
revoke all on function public.admin_list_pin_comments(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_pin_comments(integer, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
