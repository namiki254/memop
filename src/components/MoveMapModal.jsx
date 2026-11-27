// 親フォルダをたどって「親 / 子 / 孫」という表示名を作る
function buildFolderPath(folder, folders) {
  const names = [folder.name];
  const visitedFolderIds = new Set([folder.id]);
  let parentFolderId = folder.parent_folder_id;

  while (parentFolderId) {
    // データの不具合で循環していても、無限ループしないようにする
    if (visitedFolderIds.has(parentFolderId)) break;

    visitedFolderIds.add(parentFolderId);

    const parentFolder = folders.find(
      (candidate) => candidate.id === parentFolderId,
    );

    if (!parentFolder) break;

    names.unshift(parentFolder.name);
    parentFolderId = parentFolder.parent_folder_id;
  }

  return names.join(" / ");
}

export default function MoveMapModal({
  map,
  folders,
  destinationFolderId,
  onDestinationChange,
  onMove,
  onCancel,
  moving,
  error,
}) {
  // 移動するマップが選ばれていない場合は何も表示しない
  if (!map) return null;

  const currentFolderId = map.folder_id ?? "";
  const isSameDestination =
    destinationFolderId === currentFolderId;

  const folderOptions = folders
    .map((folder) => ({
        id: folder.id,
        label: buildFolderPath(folder, folders),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (!moving && !isSameDestination) {
            onMove();
          }
        }}
        className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl"
      >
        <h3 className="text-lg font-bold text-ink">
          マップを移動
        </h3>

        <p className="mt-1 break-words text-sm text-sub">
          「{map.title}」の移動先を選んでください。
        </p>

        <label
          htmlFor="move-destination"
          className="label mt-4"
        >
          移動先
        </label>

        <select
          id="move-destination"
          value={destinationFolderId}
          onChange={(event) =>
            onDestinationChange(event.target.value)
          }
          disabled={moving}
          className="field mt-1"
        >
          <option value="">ホーム（フォルダに入れない）</option>

          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.label}
            </option>
          ))}
        </select>

        {error && (
          <p className="notice-error mt-3">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={moving}
            className="btn"
          >
            キャンセル
          </button>

          <button
            type="submit"
            disabled={moving || isSameDestination}
            className="btn btn-primary"
          >
            {moving ? "移動中..." : "移動"}
          </button>
        </div>
      </form>
    </div>
  );
}