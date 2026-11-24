import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001";
const viewer = "00000000-0000-4000-8000-000000000002";
const stranger = "00000000-0000-4000-8000-000000000003";
const admin = "00000000-0000-4000-8000-000000000004";
const legacyPublic = "10000000-0000-4000-8000-000000000001";
const legacyPrivate = "10000000-0000-4000-8000-000000000002";
const publicMap = "10000000-0000-4000-8000-000000000003";
const publicPin = "20000000-0000-4000-8000-000000000001";
const sharedPin = "20000000-0000-4000-8000-000000000002";
const sql = (path) => readFile(new URL(path, import.meta.url), "utf8");

async function asUser(id, query, params = [], share) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${id ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? ""]);
    await tx.query("select set_config('request.headers', $1, true)", [JSON.stringify({
      "x-map-share-scope": "1", ...(share ? { "x-map-share-id": share.id, "x-map-share-token": share.token } : {}),
    })]);
    return tx.query(query, params);
  });
}
async function token(mapId) {
  return (await asUser(owner, "select public.get_map_share_token($1) token", [mapId])).rows[0].token;
}

before(async () => {
  await db.exec(await sql("./fixtures/map-access-schema.sql"));
  await db.query("insert into auth.users(id,is_admin) values ($1,false),($2,false),($3,false),($4,true)", [owner,viewer,stranger,admin]);
  await db.query("insert into public.maps(id,user_id,title,image_url,is_public) values ($1,$3,'既存の公開','legacy.png',true),($2,$3,'既存の非公開','private.png',false)", [legacyPublic,legacyPrivate,owner]);
  await db.query("update public.maps set created_at='2025-01-01T00:00:00Z' where id=$1", [legacyPublic]);
  await db.exec(await sql("../docs/sql/20261124082657_map_share_scope_prepare.sql"));
  await db.exec("update private.map_share_settings set enforced = true");
  await db.exec(await sql("../supabase/migrations/20261124085317_public_map_visibility.sql"));
  await asUser(owner, "insert into public.maps(id,user_id,title,image_url,visibility) values ($1,$2,'新規公開','public.png','public')", [publicMap,owner]);
  await asUser(owner, "insert into public.pins(id,map_id,user_id) values ($1,$3,$5),($2,$4,$5)", [publicPin,sharedPin,publicMap,legacyPublic,owner]);
  await db.exec("insert into storage.objects(bucket_id,name) values ('map-images','public.png'),('map-images','legacy.png'),('map-images','private.png')");
});
after(() => db.close());

test("既存の公開はすべてURL限定公開になり、非公開も維持する", async () => {
  const { rows } = await db.query("select id,visibility from public.maps where id in ($1,$2) order by id", [legacyPublic,legacyPrivate]);
  assert.deepEqual(rows.map((row) => row.visibility), ["unlisted","private"]);
});
test("未ログインの一覧・ピン・画像に公開だけが含まれる", async () => {
  assert.deepEqual((await asUser(null,"select id from public.maps")).rows.map((r) => r.id), [publicMap]);
  assert.deepEqual((await asUser(null,"select id from public.pins")).rows.map((r) => r.id), [publicPin]);
  assert.deepEqual((await asUser(null,"select name from storage.objects")).rows.map((r) => r.name), ["public.png"]);
});
test("未ログインでも正しい共有URLのマップ・ピン・画像を読めるが、別マップには及ばない", async () => {
  const share = { id:legacyPublic, token:await token(legacyPublic) };
  assert.equal((await asUser(null,"select id from public.maps where id=$1",[legacyPublic],share)).rows.length,1);
  assert.equal((await asUser(null,"select id from public.pins where id=$1",[sharedPin],share)).rows.length,1);
  assert.equal((await asUser(null,"select name from storage.objects where name='legacy.png'",[],share)).rows.length,1);
  assert.equal((await asUser(null,"select id from public.maps where id=$1",[legacyPrivate],share)).rows.length,0);
  await assert.rejects(asUser(null,"insert into public.saved_maps(user_id,map_id) values ($1,$2)",[viewer,publicMap]), /permission denied/);
  await assert.rejects(asUser(null,"insert into public.pins(map_id,user_id) values ($1,$2)",[publicMap,viewer]), /permission denied/);
  await assert.rejects(asUser(null,"insert into public.pin_comments(pin_id,user_id,content) values ($1,$2,'不可')",[publicPin,viewer]), /permission denied/);
});
test("保存していないログイン閲覧者も公開マップにピンとコメントを投稿できる", async () => {
  await asUser(viewer,"insert into public.pins(map_id,user_id) values ($1,$2)",[publicMap,viewer]);
  await asUser(viewer,"insert into public.pin_comments(pin_id,user_id,content) values ($1,$2,'公開コメント')",[publicPin,viewer]);
  assert.equal((await asUser(null,"select content from public.pin_comments")).rows[0].content,"公開コメント");
});
test("保存と解除は自分の記録だけを変更し、元マップや他人の保存を消さない", async () => {
  await asUser(viewer,"insert into public.saved_maps(user_id,map_id) values ($1,$2) on conflict do nothing",[viewer,publicMap]);
  await asUser(viewer,"insert into public.saved_maps(user_id,map_id) values ($1,$2) on conflict do nothing",[viewer,publicMap]);
  assert.equal((await asUser(viewer,"select * from public.saved_maps")).rows.length,1);
  await asUser(stranger,"delete from public.saved_maps where map_id=$1",[publicMap]);
  assert.equal((await asUser(viewer,"select * from public.saved_maps")).rows.length,1);
  await asUser(viewer,"delete from public.saved_maps where map_id=$1",[publicMap]);
  assert.equal((await asUser(viewer,"select * from public.saved_maps")).rows.length,0);
  assert.equal((await asUser(null,"select id from public.maps where id=$1",[publicMap])).rows.length,1);
});
test("URL限定公開でも共有リンクの閲覧権限があればログインして投稿できる", async () => {
  const share={ id:legacyPublic,token:await token(legacyPublic) };
  await assert.rejects(asUser(viewer,"insert into public.pins(map_id,user_id) values ($1,$2)",[legacyPublic,viewer]), /row-level security/);
  await asUser(viewer,"select public.accept_map_share_link($1,$2)",[legacyPublic,share.token],share);
  await asUser(viewer,"insert into public.pins(map_id,user_id) values ($1,$2)",[legacyPublic,viewer]);
  await asUser(viewer,"insert into public.pin_comments(pin_id,user_id,content) values ($1,$2,'限定コメント')",[sharedPin,viewer]);
});
test("公開へ変更しても共有受信記録を作れず、限定公開へ戻すと古いリンク・保存では読めない", async () => {
  const oldToken=await token(legacyPublic);
  await asUser(viewer,"insert into public.saved_maps(user_id,map_id) values ($1,$2)",[viewer,legacyPublic]);
  await asUser(owner,"update public.maps set visibility='public' where id=$1",[legacyPublic]);
  const duringPublic=(await db.query("select token from private.map_share_tokens where map_id=$1",[legacyPublic])).rows[0].token;
  assert.equal((await asUser(viewer,"select public.accept_map_share_link($1,$2) accepted",[legacyPublic,duringPublic])).rows[0].accepted,false);
  await asUser(owner,"update public.maps set visibility='unlisted' where id=$1",[legacyPublic]);
  const freshToken=await token(legacyPublic);
  assert.notEqual(freshToken,oldToken);
  assert.equal((await asUser(viewer,"select id from public.maps where id=$1",[legacyPublic])).rows.length,0);
  assert.equal((await asUser(null,"select id from public.maps where id=$1",[legacyPublic],{id:legacyPublic,token:oldToken})).rows.length,0);
  await assert.rejects(asUser(viewer,"insert into public.pins(map_id,user_id) values ($1,$2)",[legacyPublic,viewer]), /row-level security/);
  await assert.rejects(asUser(viewer,"insert into public.pin_comments(pin_id,user_id,content) values ($1,$2,'不可')",[sharedPin,viewer]), /row-level security/);
  assert.equal((await asUser(null,"select id from public.maps where id=$1",[legacyPublic],{id:legacyPublic,token:freshToken})).rows.length,1);
});
test("非公開に変われば保存・共有URLがあっても他人には内容を返さない", async () => {
  const oldToken=await token(legacyPublic);
  await asUser(viewer,"select public.accept_map_share_link($1,$2)",[legacyPublic,oldToken]);
  await asUser(owner,"update public.maps set visibility='private' where id=$1",[legacyPublic]);
  const share={id:legacyPublic,token:oldToken};
  assert.equal((await asUser(viewer,"select id from public.maps where id=$1",[legacyPublic],share)).rows.length,0);
  assert.equal((await asUser(viewer,"select id from public.pins where map_id=$1",[legacyPublic],share)).rows.length,0);
  assert.equal((await asUser(viewer,"select content from public.pin_comments where pin_id=$1",[sharedPin],share)).rows.length,0);
  assert.equal((await asUser(viewer,"select name from storage.objects where name='legacy.png'",[],share)).rows.length,0);
  assert.equal((await asUser(owner,"select id from public.maps where id=$1",[legacyPublic])).rows.length,1);
  assert.equal((await asUser(admin,"select id from public.maps where id=$1",[legacyPublic])).rows.length,1);
});
test("公開範囲の変更は作成者・管理者だけ。旧クライアントの作成も勝手に公開しない", async () => {
  assert.equal((await asUser(viewer,"update public.maps set visibility='private' where id=$1 returning id",[publicMap])).rows.length,0);
  assert.equal((await asUser(admin,"update public.maps set visibility='unlisted' where id=$1 returning id",[publicMap])).rows.length,1);
  const {rows}=await asUser(owner,"insert into public.maps(user_id,title,image_url,is_public) values ($1,'旧公開','old.png',true),($1,'旧非公開','old-private.png',false) returning visibility",[owner]);
  assert.deepEqual(rows.map((r)=>r.visibility),["unlisted","private"]);
  await assert.rejects(asUser(owner,"update public.maps set visibility='invalid' where id=$1",[publicMap]), /check constraint/);
});
test("管理コメント一覧は3種類の公開範囲を返し、一般ユーザーには拒否する", async () => {
  await assert.rejects(asUser(viewer,"select * from public.admin_list_pin_comments(0,51)"), /map_admin_required/);
  const {rows}=await asUser(admin,"select * from public.admin_list_pin_comments(0,51)");
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r)=>["public","unlisted","private"].includes(r.visibility)));
});
test("更新日順の並び替えに使う日時は既存マップにも入り、編集時に更新される", async () => {
  const legacy=(await db.query("select created_at,updated_at from public.maps where id=$1",[legacyPrivate])).rows[0];
  assert.equal(legacy.updated_at.getTime(),legacy.created_at.getTime());
  const edited=(await asUser(owner,"update public.maps set title='更新したマップ' where id=$1 returning created_at,updated_at",[legacyPublic])).rows[0];
  assert.ok(edited.updated_at.getTime()>edited.created_at.getTime());
});
