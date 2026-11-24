-- Supabase の SQL Editor で全体を実行する（#5 ピンに食べログの店舗ページ URL を任意で付ける）。
-- 実行前でもアプリは動く。URL を空欄にしたピンはこれまでどおり保存でき、URL を入れて保存したときだけ案内が出る。
begin;

-- 1. 任意入力なので null を許す。既存のピンは null のまま変わらない。
alter table public.pins add column if not exists tabelog_url text;

-- 2. 食べログ（tabelog.com とそのサブドメイン）の https の URL だけを受け付ける。
--    画面側の確認（src/lib/tabelogUrl.js）と同じ条件にする。
alter table public.pins drop constraint if exists pins_tabelog_url_check;
alter table public.pins add constraint pins_tabelog_url_check check (
  tabelog_url is null
  or (
    char_length(tabelog_url) <= 500
    and tabelog_url ~* '^https://([a-z0-9-]+\.)*tabelog\.com/\S*$'
  )
);

-- 3. 既存の列と同じように読み書きできるようにする。
--    誰がどのピンを読み書きできるかは、これまでの pins の行単位のルール（RLS）がそのまま効く。
grant select (tabelog_url) on table public.pins to anon, authenticated;
grant insert (tabelog_url), update (tabelog_url) on table public.pins to authenticated;

-- 4. Supabase の API に新しい列を読み込ませる。
notify pgrst, 'reload schema';
commit;
