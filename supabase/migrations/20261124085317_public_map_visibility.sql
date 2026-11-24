-- Issue #29。Issue #10 の準備SQLを適用したあと、フロントエンド公開前に実行する。
-- 既存の「公開」(is_public=true) は必ずURL限定公開として引き継ぐ。
begin;
alter table public.maps add column visibility text;
alter table public.maps add column if not exists updated_at timestamptz;
update public.maps set updated_at = created_at where updated_at is null;
alter table public.maps alter column updated_at set default now();
alter table public.maps alter column updated_at set not null;
update public.maps set visibility = case when is_public then 'unlisted' else 'private' end;
alter table public.maps alter column visibility set not null;
alter table public.maps add constraint maps_visibility_check check (visibility in ('public', 'unlisted', 'private'));

-- 旧フロントも動かせるようis_publicと同期する。新規UIは明示的にpublicを送る。
-- DBにpublicのデフォルトは置かず、旧クライアントの非公開作成も維持する。
create function private.sync_map_visibility()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.visibility := coalesce(new.visibility, case when new.is_public then 'unlisted' else 'private' end);
  elsif new.visibility is not distinct from old.visibility and new.is_public is distinct from old.is_public then
    new.visibility := case when new.is_public then 'unlisted' else 'private' end;
  end if;
  new.is_public := new.visibility <> 'private';
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  if tg_op = 'UPDATE' and new.visibility is distinct from old.visibility then
    -- 公開中の保存や過去の共有記録を、新たな限定公開の権限にはしない。
    delete from private.map_share_users where map_id = new.id;
    update private.map_share_tokens set token = gen_random_uuid() where map_id = new.id;
  end if;
  return new;
end;
$function$;
revoke all on function private.sync_map_visibility() from public, anon, authenticated;
create trigger maps_sync_visibility before insert or update on public.maps
  for each row execute function private.sync_map_visibility();
alter table public.maps add constraint maps_visibility_matches_legacy check (is_public = (visibility <> 'private'));
create index maps_public_created_at_idx on public.maps (created_at desc, id) where visibility = 'public';

-- 公開だけが共有キー不要。URL限定公開は引き続きIssue #10のマップ単位の判定を使う。
drop policy maps_share_scope on public.maps;
create policy maps_share_scope on public.maps as restrictive for select to anon, authenticated
  using (
    visibility = 'public'
    or user_id = (select auth.uid())
    or (select private.map_share_is_admin())
    or (visibility = 'unlisted' and private.has_map_share(id))
  );

-- 公開中に共有URLを取得・受信記録することはできない。
create or replace function public.get_map_share_token(target_map_id uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.maps as map where map.id = target_map_id and map.visibility = 'unlisted'
      and (map.user_id = auth.uid() or public.is_map_admin()
        or exists (
          select 1 from private.map_share_users recipient
          join private.map_share_tokens share on share.map_id = recipient.map_id and share.token = recipient.token
          where recipient.map_id = map.id and recipient.user_id = auth.uid()
        ))
  ) then
    raise exception 'map_share_required' using errcode = '42501';
  end if;
  return (select token from private.map_share_tokens where map_id = target_map_id);
end;
$function$;

create or replace function public.accept_map_share_link(target_map_id uuid, share_token uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare
  recipient_id uuid := auth.uid();
begin
  if recipient_id is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  -- マップ行をロックし、共有受信と公開範囲の変更が同時に起きても古い権限を残さない。
  perform 1 from public.maps as map where map.id = target_map_id and map.visibility = 'unlisted' for share;
  if not found or not exists (
    select 1 from private.map_share_tokens where map_id = target_map_id and token = share_token
  ) then return false; end if;
  insert into private.map_share_users (map_id, user_id, token)
    values (target_map_id, recipient_id, share_token)
    on conflict (map_id, user_id) do update set token = excluded.token;
  return true;
end;
$function$;
revoke all on function public.get_map_share_token(uuid) from public, anon, authenticated;
revoke all on function public.accept_map_share_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_map_share_token(uuid) to authenticated;
grant execute on function public.accept_map_share_link(uuid, uuid) to authenticated;

-- 管理コメント一覧も3種類の公開範囲を返す。旧画面用のis_publicは維持する。
drop function public.admin_list_pin_comments(integer, integer);
create function public.admin_list_pin_comments(page_offset integer, page_limit integer)
returns table (
  comment_id text, content text, user_id text, creator_username text, created_at timestamptz,
  pin_id text, pin_title text, map_id text, map_title text, is_public boolean, visibility text
)
language plpgsql stable set search_path = ''
as $function$
begin
  if public.is_map_admin() is distinct from true then
    raise exception 'map_admin_required' using errcode = '42501';
  end if;
  if page_offset is null or page_offset < 0 or page_limit is null or page_limit not between 1 and 51 then
    raise exception 'invalid_comment_list_page' using errcode = '22023';
  end if;
  return query
    select comment.id::text, comment.content::text, comment.user_id::text,
      comment.creator_username::text, comment.created_at, pin.id::text, pin.title::text,
      map.id::text, map.title::text, map.is_public, map.visibility
    from public.pin_comments as comment
    join public.pins as pin on pin.id = comment.pin_id
    join public.maps as map on map.id = pin.map_id
    order by comment.created_at desc nulls last, comment.id desc
    limit page_limit offset page_offset;
end;
$function$;
revoke all on function public.admin_list_pin_comments(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_pin_comments(integer, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
