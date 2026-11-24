import test from "node:test";
import assert from "node:assert/strict";
import { getMapCreationErrorMessage, isMapVisibilityMissing, MAP_VISIBILITY_NOT_READY_MESSAGE } from "../src/lib/mapCreationErrors.js";

test("visibility未反映は作成されていないことと設定更新を案内する", () => {
  for (const error of [
    { code: "PGRST204", message: "Could not find the 'visibility' column of 'maps' in the schema cache" },
    { code: "42703", message: "column maps.visibility does not exist" },
  ]) {
    assert.equal(isMapVisibilityMissing(error), true);
    assert.equal(getMapCreationErrorMessage(error), MAP_VISIBILITY_NOT_READY_MESSAGE);
    assert.doesNotMatch(getMapCreationErrorMessage(error), /一覧|かもしれない/);
  }
});
test("別の列の不足や権限エラーは公開設定の不足と混同しない", () => {
  const error = { code: "42501", message: "new row violates row-level security policy" };
  assert.equal(isMapVisibilityMissing(error), false);
  assert.match(getMapCreationErrorMessage(error), /作成されませんでした/);
  assert.equal(isMapVisibilityMissing({ code: "PGRST204", message: "column 'description' not found" }), false);
});
test("通信切断で結果が不明な場合だけ重複確認を案内する", () => {
  assert.match(getMapCreationErrorMessage({ message: "Failed to fetch" }), /一覧に同じマップがないか確認/);
});
