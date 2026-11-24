export const SAVED_MAPS_CHANGED = "memop:saved-maps-changed";

export function notifySavedMapsChanged(mapId, saved) {
  window.dispatchEvent(new CustomEvent(SAVED_MAPS_CHANGED, { detail: { mapId, saved } }));
  // 別タブでも一覧と移動先候補を更新する。保存済み一覧そのものはDBで管理する。
  try {
    localStorage.setItem(SAVED_MAPS_CHANGED, JSON.stringify({ mapId, saved, at: Date.now() }));
  } catch {
    // ブラウザがlocalStorageを制限していても、保存操作は成功している。
  }
}

export function subscribeSavedMapsChanged(callback) {
  function onStorage(event) {
    if (event.key === SAVED_MAPS_CHANGED) callback();
  }
  window.addEventListener(SAVED_MAPS_CHANGED, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SAVED_MAPS_CHANGED, callback);
    window.removeEventListener("storage", onStorage);
  };
}
