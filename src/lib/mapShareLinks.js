import { getMapVisibility } from "./mapVisibility.js";
import { supabase } from "./supabase.js";
import { getCurrentMapShare } from "./mapShareAccess.js";

export async function getMapShareUrl(mapId, map, canManage) {
  if (getMapVisibility(map) === "private") throw new Error("非公開マップは共有できません。");
  const url = new URL(`/maps/${mapId}`, window.location.origin);
  // ピンやコメントを指定していた場合は、共有リンクにもその指定を引き継ぐ。
  if (window.location.pathname === url.pathname) {
    const current = new URL(window.location.href);
    for (const name of ["pin", "comment"]) {
      const value = current.searchParams.get(name);
      if (value) url.searchParams.set(name, value);
    }
  }
  if (getMapVisibility(map) !== "unlisted") return url.href;

  let token = getCurrentMapShare(mapId)?.token;
  if (canManage || !token) {
    // キーの取得権限は Supabase が確認し、通常のマップ一覧にはキーを含めない。
    const { data, error } = await supabase.rpc("get_map_share_token", { target_map_id: mapId });
    if (error || !data) throw new Error("共有リンクを取得できませんでした。");
    token = data;
  }
  if (!token) throw new Error("作成者または管理者から共有リンクを受け取ってください。");
  url.searchParams.set("share", token);
  return url.href;
}
