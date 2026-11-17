import { supabase } from "./supabase.js";

export const ADMIN_COMMENT_DELETE_SETUP_MESSAGE =
  "コメント削除用の関数が見つかりません。docs/sql/issue-13-admin-delete-comment.sql を SQL Editor で実行してください。";

// コメント管理とピンの詳細パネルで、同じ管理者向けの削除処理を使う。
export function deleteCommentAsAdmin(commentId) {
  return supabase.rpc("admin_delete_pin_comment", { target_comment_id: String(commentId) });
}
