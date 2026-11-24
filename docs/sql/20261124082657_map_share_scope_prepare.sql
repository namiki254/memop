-- 1. 共有キーと移行状態は API に公開しないスキーマに保存する。
-- この準備 SQL の適用後も、旧アプリのリクエストは本番切替まで従来の条件で動く。
begin;
create schema if not exists private;
create table if not exists private.map_share_settings (
  singleton boolean primary key default true check (singleton),
  enforced boolean not null default false
);
insert into private.map_share_settings (singleton) values (true) on conflict do nothing;

create table if not exists private.map_share_tokens (
  map_id uuid primary key references public.maps(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique
);
create table if not exists private.map_share_users (
  map_id uuid not null references public.maps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token uuid not null,
  primary key (map_id, user_id)
);
-- アカウント削除時に、そのユーザーの受信記録を全件走査せずに探せるようにする。
create index if not exists map_share_users_user_id_idx on private.map_share_users (user_id);
-- この3テーブルは直接の読み書きを許可せず、権限を確認する関数からだけ操作する。
alter table private.map_share_settings enable row level security;
alter table private.map_share_tokens enable row level security;
alter table private.map_share_users enable row level security;
revoke all on private.map_share_settings, private.map_share_tokens, private.map_share_users
  from public, anon, authenticated;

-- 既存マップにもキーを発行する。再実行しても発行済みのキーは変えない。
insert into private.map_share_tokens (map_id) select id from public.maps on conflict do nothing;
create or replace function private.create_map_share_token()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  insert into private.map_share_tokens (map_id) values (new.id) on conflict do nothing;
  return new;
end;
$function$;
revoke all on function private.create_map_share_token() from public, anon, authenticated;
drop trigger if exists maps_create_share_token on public.maps;
create trigger maps_create_share_token after insert on public.maps
  for each row execute function private.create_map_share_token();

-- 2. 正しいキーを提示したマップと、共有リンクを受け取ったログインユーザーを判定する。
create or replace function private.has_map_share(target_map_id uuid)
returns boolean language plpgsql stable security definer set search_path = ''
as $function$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  -- 本番切替前でも、新しいアプリからのリクエストには新しい閲覧条件を適用する。
  if not (select enforced from private.map_share_settings where singleton)
     and headers ->> 'x-map-share-scope' is distinct from '1' then
    return true;
  end if;

  return exists (
    select 1 from private.map_share_tokens as share
    where share.map_id = target_map_id and (
      (headers ->> 'x-map-share-id' = share.map_id::text
       and headers ->> 'x-map-share-token' = share.token::text)
      or exists (
        select 1 from private.map_share_users as recipient
        where recipient.map_id = share.map_id and recipient.token = share.token
          and recipient.user_id = (select auth.uid())
      )
    )
  );
exception when invalid_text_representation then
  -- 壊れたヘッダーを送られた場合は、共有リンクによる閲覧を許可しない。
  return false;
end;
$function$;
grant usage on schema private to anon, authenticated;
revoke all on function private.has_map_share(uuid) from public, anon, authenticated;
grant execute on function private.has_map_share(uuid) to anon, authenticated;

-- 3. 作成者・管理者、または正しい共有リンクを持つ人にマップの閲覧を限定する。
-- 既存の pins・pin_comments・画像の RLS も、この maps の閲覧条件を参照する。
-- 元の is_map_admin はログインユーザー専用なので、匿名閲覧にも安全な判定窓口を用意する。
-- 呼び出した人のログイン情報で判定し、元の関数の実行権限は広げない。
create or replace function private.map_share_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and public.is_map_admin();
$function$;
revoke all on function private.map_share_is_admin() from public, anon, authenticated;
grant execute on function private.map_share_is_admin() to anon, authenticated;

drop policy if exists maps_share_scope on public.maps;
create policy maps_share_scope on public.maps as restrictive for select to anon, authenticated
  using (
    user_id = (select auth.uid())
    or (select private.map_share_is_admin())
    or (is_public and private.has_map_share(id))
  );

-- 4. 作成者・管理者・共有リンクを受け取ったユーザーは、コピー用のキーを取得できる。
create or replace function public.get_map_share_token(target_map_id uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.maps as map where map.id = target_map_id
      and (map.user_id = auth.uid() or public.is_map_admin()
        or (map.is_public and exists (
          select 1 from private.map_share_users recipient
          join private.map_share_tokens share on share.map_id = recipient.map_id and share.token = recipient.token
          where recipient.map_id = map.id and recipient.user_id = auth.uid()
        )))
  ) then
    raise exception 'map_management_required' using errcode = '42501';
  end if;
  return (select token from private.map_share_tokens where map_id = target_map_id);
end;
$function$;

-- 5. ログイン中に正しいリンクを開いた場合、そのユーザーに対象マップだけを記録する。
-- 非公開へ変更したマップは、上の閲覧ルールで受信者から見えなくなる。
create or replace function public.accept_map_share_link(target_map_id uuid, share_token uuid)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare
  recipient_id uuid := auth.uid();
begin
  if recipient_id is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.maps as map
    join private.map_share_tokens as share on share.map_id = map.id
    where map.id = target_map_id and map.is_public and share.token = share_token
  ) then
    return false;
  end if;

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
notify pgrst, 'reload schema';
commit;
