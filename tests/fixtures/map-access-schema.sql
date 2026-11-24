-- 実データを使わず、既存のテーブルと権限ルールを再現する。
create role anon;
create role authenticated;
create schema auth;
create schema storage;
create table auth.users (id uuid primary key, is_admin boolean not null default false);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create function public.is_map_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = auth.uid() and is_admin);
$$;
revoke all on function public.is_map_admin() from public, anon;
grant execute on function public.is_map_admin() to authenticated;
create table public.maps (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users,
  title text not null, description text not null default '', image_url text not null,
  folder_id uuid, is_public boolean not null default false, created_at timestamptz not null default now()
);
create table public.pins (
  id uuid primary key default gen_random_uuid(), map_id uuid not null references public.maps on delete cascade,
  user_id uuid not null references auth.users, title text not null default '',
  created_at timestamptz not null default now()
);
create table public.pin_comments (
  id uuid primary key default gen_random_uuid(), pin_id uuid not null references public.pins on delete cascade,
  user_id uuid not null references auth.users, content text not null, creator_username text,
  created_at timestamptz not null default now()
);
create table public.saved_maps (
  user_id uuid not null references auth.users, map_id uuid not null references public.maps on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id,map_id)
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table public.maps enable row level security;
alter table public.pins enable row level security;
alter table public.pin_comments enable row level security;
alter table public.saved_maps enable row level security;
alter table storage.objects enable row level security;
grant select on public.maps, public.pins, public.pin_comments, storage.objects to anon, authenticated;
grant insert, update, delete on public.maps, public.pins, public.pin_comments to authenticated;
grant select, insert, delete on public.saved_maps to authenticated;
create policy maps_read on public.maps for select to anon, authenticated using (is_public or user_id = (select auth.uid()));
create policy maps_admin_read on public.maps for select to authenticated using ((select public.is_map_admin()));
create policy maps_insert on public.maps for insert to authenticated with check (user_id = (select auth.uid()));
create policy maps_update on public.maps for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_map_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_map_admin()));
create policy pins_read on public.pins for select to anon, authenticated using (exists(select 1 from public.maps where id = pins.map_id));
create policy pins_insert on public.pins for insert to authenticated with check
  (user_id = (select auth.uid()) and exists(select 1 from public.maps where id = pins.map_id));
create policy comments_read on public.pin_comments for select to anon, authenticated using (exists(select 1 from public.pins where id = pin_comments.pin_id));
create policy comments_insert on public.pin_comments for insert to authenticated with check
  (user_id = (select auth.uid()) and exists(select 1 from public.pins where id = pin_comments.pin_id));
create policy saved_maps_read on public.saved_maps for select to authenticated using (user_id = (select auth.uid()));
create policy saved_maps_insert on public.saved_maps for insert to authenticated with check
  (user_id = (select auth.uid()) and exists(select 1 from public.maps where id = saved_maps.map_id));
create policy saved_maps_delete on public.saved_maps for delete to authenticated using (user_id = (select auth.uid()));
create policy image_read on storage.objects for select to anon, authenticated using
  (bucket_id = 'map-images' and exists(select 1 from public.maps where image_url = storage.objects.name));
-- 既存の関数は今回の移行で戻り値を追加して置き換える。
create function public.admin_list_pin_comments(integer,integer) returns boolean language sql as $$ select false $$;
