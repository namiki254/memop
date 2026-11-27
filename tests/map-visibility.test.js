import test from "node:test";
import assert from "node:assert/strict";
import { getMapVisibilityLabel } from "../src/lib/mapVisibility.js";

test("旧形式の公開データは全画面共通でURL限定公開と表示する", () => {
  assert.equal(getMapVisibilityLabel({is_public:true}),"URL限定公開");
  assert.equal(getMapVisibilityLabel({visibility:"unlisted",is_public:true}),"URL限定公開");
  assert.equal(getMapVisibilityLabel({is_public:false}),"非公開");
  assert.equal(getMapVisibilityLabel({visibility:"public",is_public:true}),"公開");
});
