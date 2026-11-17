import { supabase } from "./supabase.js";

export const ADMIN_COMMENT_DELETE_UNAVAILABLE_MESSAGE =
  "管理者によるコメント削除は現在利用できません。運営担当者にお問い合わせください。";

// コメント管理とピンの詳細パネルで、同じ管理者向けの削除処理を使う。
export function deleteCommentAsAdmin(commentId) {
  return supabase.rpc("admin_delete_pin_comment", { target_comment_id: String(commentId) });
}
