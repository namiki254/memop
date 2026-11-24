const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getCurrentMapShare(mapId) {
  const location = new URL(window.location.href);
  const match = location.pathname.match(/^\/maps\/([^/]+)$/);
  const token = location.searchParams.get("share");
  if (!match || !uuidPattern.test(match[1]) || !uuidPattern.test(token ?? "")) return null;
  if (mapId && match[1].toLowerCase() !== mapId.toLowerCase()) return null;
  return { mapId: match[1].toLowerCase(), token: token.toLowerCase() };
}

export function addMapShareHeaders(input, init, supabaseUrl) {
  const requestUrl = new URL(input instanceof Request ? input.url : input);
  // 共有キーは、接続先のデータ取得・画像取得のリクエストにだけ付ける。
  if (requestUrl.origin !== new URL(supabaseUrl).origin
    || !/^\/(rest|storage)\/v1\//.test(requestUrl.pathname)) return init;

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("x-map-share-scope", "1");
  headers.delete("x-map-share-id");
  headers.delete("x-map-share-token");
  const share = getCurrentMapShare();
  if (share) {
    headers.set("x-map-share-id", share.mapId);
    headers.set("x-map-share-token", share.token);
  }
  return { ...init, headers };
}
