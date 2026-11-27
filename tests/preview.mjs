// npm run test:preview。架空データだけでUIを確認するローカル専用サーバー。
import http from "node:http";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "vite";

const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001";
const viewer = "00000000-0000-4000-8000-000000000002";
const mapA = "10000000-0000-4000-8000-000000000001";
const mapB = "10000000-0000-4000-8000-000000000002";
const ownMap = "10000000-0000-4000-8000-000000000003";
const unlisted = "10000000-0000-4000-8000-000000000004";
const load = (path) => readFile(new URL(path, import.meta.url), "utf8");
await db.exec(await load("./fixtures/map-access-schema.sql"));
await db.exec(`
  alter table public.pins add column x real default .5, add column y real default .5,
    add column content text default '', add column pin_type text default 'restaurant',
    add column kind text default 'pin', add column link_map_id uuid, add column tabelog_url text,
    add column creator_username text;
  create table public.folders (id uuid primary key, name text, user_id uuid, parent_folder_id uuid);
  create table public.saved_folders (folder_id uuid, user_id uuid);
  grant select on public.folders to anon, authenticated;
  grant select on public.saved_folders to authenticated;
`);
await db.query("insert into auth.users(id) values ($1),($2)",[owner,viewer]);
await db.exec(await load("../docs/sql/20261124082657_map_share_scope_prepare.sql"));
await db.exec("update private.map_share_settings set enforced=true");
await db.exec(await load("../supabase/migrations/20261124085317_public_map_visibility.sql"));
const image="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#e4f0e9"/><path d="M0 300H900M450 0V600" stroke="white" stroke-width="50"/><text x="40" y="70" font-size="32" fill="#486958">動作確認用マップ</text></svg>');
for (const [id,userId,title,visibility] of [[mapA,owner,"豊洲ランチ","public"],[mapB,owner,"カフェめぐり","public"],[ownMap,viewer,"自分のマップ","private"],[unlisted,owner,"URL限定マップ","unlisted"]]) {
  await db.query("insert into public.maps(id,user_id,title,description,image_url,visibility) values ($1,$2,$3,'ローカルの架空データです',$4,$5)",[id,userId,title,image,visibility]);
}
await db.query("insert into public.pins(map_id,user_id,title,kind,link_map_id) values ($1,$2,'カフェへ移動','button',$3)",[mapA,owner,mapB]);

const uiOrigin="http://127.0.0.1:4179";
function jwt(userId) {
  const enc=(x)=>Buffer.from(JSON.stringify(x)).toString("base64url");
  return `${enc({alg:"HS256",typ:"JWT"})}.${enc({sub:userId,aud:"authenticated",role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})}.local-test-signature`;
}
function getUserId(req) {
  try { return JSON.parse(Buffer.from(req.headers.authorization.split(" ")[1].split(".")[1],"base64url")).sub; }
  catch { return null; }
}
function user(id) { return {id,aud:"authenticated",email:id===owner?"owner@example.test":"viewer@example.test",app_metadata:{provider:"email"},user_metadata:{},created_at:new Date().toISOString()}; }
const tables=new Set(["maps","pins","pin_comments","saved_maps","folders","saved_folders"]);
const ident=(value)=>{if(!/^[a-z_]+$/.test(value))throw Error("invalid column");return '"'+value+'"';};

const api=http.createServer(async (req,res)=>{
  res.setHeader("Access-Control-Allow-Origin",uiOrigin);
  res.setHeader("Access-Control-Allow-Headers","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,PATCH,DELETE,OPTIONS");
  if(req.method==="OPTIONS") {res.writeHead(204);res.end();return;}
  const url=new URL(req.url,"http://127.0.0.1:55439");
  if(url.pathname.startsWith("/login/")||url.pathname==="/auth/v1/authorize") {
    const id=url.pathname.endsWith("owner")?owner:viewer;
    res.writeHead(302,{Location:`${uiOrigin}/#access_token=${jwt(id)}&refresh_token=fixture&expires_in=3600&token_type=bearer`});res.end();return;
  }
  const userId=getUserId(req);
  if(url.pathname==="/auth/v1/user") {res.setHeader("Content-Type","application/json");res.end(JSON.stringify(user(userId)));return;}
  if(url.pathname==="/auth/v1/logout") {res.end("{}");return;}
  if(url.pathname==="/") {
    const share=(await db.query("select token from private.map_share_tokens where map_id=$1",[unlisted])).rows[0].token;
    res.setHeader("Content-Type","text/html; charset=utf-8");res.end(`<h1>ローカル動作確認</h1><a href="${uiOrigin}">未ログインのTOP</a><p><a href="/login/viewer">閲覧ユーザーでログイン</a></p><p><a href="/login/owner">作成者でログイン</a></p><p><a href="${uiOrigin}/maps/${unlisted}?share=${share}">URL限定公開の共有リンク</a></p>`);return;
  }
  let body="";for await(const chunk of req)body+=chunk;
  const data=body?JSON.parse(body):{};
  try {
    const result=await db.transaction(async tx=>{
      await tx.exec(`set local role ${userId?"authenticated":"anon"}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[userId??""]);
      await tx.query("select set_config('request.headers',$1,true)",[JSON.stringify(req.headers)]);
      if(url.pathname.startsWith("/rest/v1/rpc/")) {
        const name=url.pathname.split("/").pop();
        if(name==="is_map_admin")return false;
        if(name==="accept_map_share_link")return (await tx.query("select public.accept_map_share_link($1,$2) value",[data.target_map_id,data.share_token])).rows[0].value;
        if(name==="get_map_share_token")return (await tx.query("select public.get_map_share_token($1) value",[data.target_map_id])).rows[0].value;
        return [];
      }
      const table=url.pathname.split("/").pop();if(!tables.has(table))throw Error("unknown table");
      const params=[];const val=(v)=>{params.push(v);return "$"+params.length;};
      const conditions=[];
      for(const [key,filter] of url.searchParams) {
        if(["select","order","limit","offset","on_conflict"].includes(key))continue;
        if(key==="or") {
          const ownOrUnowned=filter.match(/^\(user_id\.eq\.([^,]+),user_id\.is\.null\)$/);
          if(ownOrUnowned) { conditions.push(`(user_id=${val(ownOrUnowned[1])} or user_id is null)`); continue; }
          const match=filter.match(/^\(user_id\.eq\.([^,]+),id\.in\.\(([^)]+)\)\)$/);
          if(!match)throw Error("unsupported OR");
          conditions.push(`(user_id=${val(match[1])} or id=any(${val(match[2].split(","))}::uuid[]))`);continue;
        }
        const column=ident(key);
        if(filter.startsWith("eq."))conditions.push(`${column}=${val(filter.slice(3))}`);
        else if(filter==="is.null")conditions.push(`${column} is null`);
        else if(filter.startsWith("in.("))conditions.push(`${column}=any(${val(filter.slice(4,-1).split(","))}::uuid[])`);
        else throw Error("unsupported filter");
      }
      const where=conditions.length?" where "+conditions.join(" and "):"";
      let query;
      if(req.method==="GET") {
        query=`select * from public.${ident(table)}${where}`;
        const order=url.searchParams.get("order");if(order)query+=" order by "+order.split(",").map(o=>{const [col,dir]=o.split(".");return ident(col)+(dir==="desc"?" desc":" asc");}).join(",");
        if(url.searchParams.has("limit"))query+=" limit "+val(Number(url.searchParams.get("limit")));
        if(url.searchParams.has("offset"))query+=" offset "+val(Number(url.searchParams.get("offset")));
      } else if(req.method==="POST") {
        const keys=Object.keys(data);query=`insert into public.${ident(table)} (${keys.map(ident)}) values (${keys.map(k=>val(data[k]))})`;
        if(table==="saved_maps")query+=" on conflict do nothing";
        query+=" returning *";
      } else if(req.method==="DELETE")query=`delete from public.${ident(table)}${where} returning *`;
      else if(req.method==="PATCH")query=`update public.${ident(table)} set ${Object.keys(data).map(k=>ident(k)+"="+val(data[k]))}${where} returning *`;
      else throw Error("unsupported method");
      const {rows}=await tx.query(query,params);
      if(table==="maps")for(const row of rows)row.map_favorites=[];
      if(table==="folders")for(const row of rows)row.folder_favorites=[];
      if(req.headers.accept?.includes("vnd.pgrst.object")) {
        if(rows.length!==1) {const e=Error("single row not found");e.code="PGRST116";throw e;}
        return rows[0];
      }
      return rows;
    });
    res.setHeader("Content-Type","application/json");res.end(JSON.stringify(result));
  } catch(error) {
    console.error(req.method,url.pathname,error.message);
    res.writeHead(400,{"Content-Type":"application/json"});res.end(JSON.stringify({code:error.code??"test_api",message:error.message}));
  }
});
api.listen(55439,"127.0.0.1");
process.env.VITE_SUPABASE_URL="http://127.0.0.1:55439";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_local_fixture";
const vite=await createServer({server:{host:"127.0.0.1",port:4179,strictPort:true}});
await vite.listen();
console.log(`動作確認UI: ${uiOrigin}\n架空のユーザー・共有リンク: http://127.0.0.1:55439`);
async function close(){await vite.close();await new Promise(resolve=>api.close(resolve));await db.close();process.exit();}
process.on("SIGINT",close);process.on("SIGTERM",close);
