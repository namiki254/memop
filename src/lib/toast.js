/**
 * 画面の上に短く出す通知の置き場．
 *
 * alert() はスマホで画面全体を止めてしまうので，操作の結果や軽いエラーはこちらで伝える．
 * どこからでも showToast("…") を呼べば，App.jsx に置いた <ToastHost />（components/Toast.jsx）が表示する．
 *
 * 使い方:
 *   showToast("コピーしました");
 *   showToast("保存できませんでした。", { tone: "error" });
 */
let toasts = [];
let nextId = 1;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts() {
  return toasts;
}

export function dismissToast(id) {
  if (!toasts.some((toast) => toast.id === id)) return;
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

export function showToast(message, { tone = "info", duration } = {}) {
  const id = nextId++;
  // 同じ文言を連続で出したときは，積み重ねずに出し直す
  toasts = [...toasts.filter((toast) => toast.message !== message), { id, message, tone }];
  emit();
  // エラーは読む時間を少し長く取る
  window.setTimeout(() => dismissToast(id), duration ?? (tone === "error" ? 6000 : 4000));
  return id;
}
