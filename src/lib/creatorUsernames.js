import { supabase } from "./supabase.js";

export async function loadCreatorUsernames(records, signal) {
  // 同じ作成者が複数の行にいても、名前の取得は1回のリクエストにまとめる。
  const userIds = [...new Set(records.map((record) => record.user_id).filter(Boolean))];
  if (userIds.length === 0) return { data: records, error: null };

  const { data: users, error } = await supabase
    .rpc("admin_get_usernames", { target_user_ids: userIds })
    .abortSignal(signal);

  // 名前の取得に失敗したときは、呼び出し元で取得エラーとして案内する。
  if (error) return { data: null, error };
  const usernames = new Map(users.map((user) => [user.user_id, user.github_username]));
  return {
    data: records.map((record) => ({ ...record, creator_username: usernames.get(record.user_id) ?? null })),
    error: null,
  };
}
