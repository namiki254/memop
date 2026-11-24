export const MAP_VISIBILITIES = [
  { value: "public", label: "公開", description: "公開マップ一覧に掲載され、ログインせずに誰でも閲覧できます。" },
  { value: "unlisted", label: "URL限定公開", description: "公開一覧には掲載されず、共有URLを知っている人が閲覧できます。" },
  { value: "private", label: "非公開", description: "作成者と管理者だけが閲覧できます。" },
];

// 移行前のレコードも、従来の共有範囲として表示する。
export function getMapVisibility(map) {
  return map?.visibility ?? (map?.is_public ? "unlisted" : "private");
}

export function getMapVisibilityLabel(map) {
  return MAP_VISIBILITIES.find((scope) => scope.value === getMapVisibility(map))?.label ?? "非公開";
}

export function mapVisibilityValues(visibility) {
  return { visibility, is_public: visibility !== "private" };
}
