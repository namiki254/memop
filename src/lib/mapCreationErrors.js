export const MAP_VISIBILITY_NOT_READY_MESSAGE =
  "公開範囲の設定がまだ反映されていないため、マップは作成されませんでした。管理者にデータベースの更新を依頼してください。";

export function isMapVisibilityMissing(error) {
  return ["PGRST204", "42703"].includes(error?.code)
    && /\bvisibility\b/i.test(error?.message ?? "");
}

export function getMapCreationErrorMessage(error) {
  if (isMapVisibilityMissing(error)) return MAP_VISIBILITY_NOT_READY_MESSAGE;
  // 入力・権限・制約のエラーは登録失敗が確定している。
  if (["PGRST204", "PGRST205", "23502", "23503", "23505", "23514", "42501", "22P02"].includes(error?.code)) {
    return `マップは作成されませんでした。${error.message}`;
  }
  // 通信切断など、登録結果を確認できない場合だけ一覧の確認を案内する。
  return `マップの作成結果を確認できませんでした。一覧に同じマップがないか確認してから、もう一度試してください。（${error?.message ?? "通信エラー"}）`;
}
