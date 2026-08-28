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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (!moving && !isSameDestination) {
            onMove();
          }
        }}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <h3 className="text-lg font-bold text-slate-800">
          マップを移動
        </h3>

        <p className="mt-1 text-sm text-slate-600">
          「{map.title}」の移動先を選んでください。
        </p>

        <label
          htmlFor="move-destination"
          className="mt-4 block text-sm font-medium text-slate-700"
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
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        >
          <option value="">ホーム（フォルダに入れない）</option>

          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.label}
            </option>
          ))}
        </select>

        {error && (
          <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={moving}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            キャンセル
          </button>

          <button
            type="submit"
            disabled={moving || isSameDestination}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {moving ? "移動中..." : "移動"}
          </button>
        </div>
      </form>
    </div>
  );
}