-- 新しいフロントエンドを本番へ公開したあと、最後にこの SQL を実行する。
-- 以降は、旧アプリやヘッダーを省略した直接リクエストにも共有キーを必須にする。
begin;
update private.map_share_settings set enforced = true where singleton;
commit;
