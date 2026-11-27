import { useSyncExternalStore } from "react";
import { dismissToast, getToasts, subscribeToasts } from "../lib/toast.js";
import Icon from "./Icon.jsx";

/** 通知の表示係．App.jsx に1つだけ置く．出す側は lib/toast.js の showToast を呼ぶ． */
export default function ToastHost() {
  const items = useSyncExternalStore(subscribeToasts, getToasts);

  return (
    // 入れ物は常に置いておく．通知が増えたときに読み上げソフトへ伝わるようにするため．
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-3 z-[60] flex flex-col items-center gap-2"
    >
      {items.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : undefined}
          className={`pointer-events-auto flex max-w-sm items-center gap-1 rounded-lg py-1 pl-3.5 pr-1 text-sm font-medium text-white shadow-lg ${toast.tone === "error" ? "bg-danger" : "bg-ink"}`}
        >
          <p className="min-w-0 break-words py-1.5">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="通知を閉じる"
            className="grid size-9 shrink-0 place-items-center rounded-md text-white/80 hover:bg-white/15 hover:text-white"
          >
            <Icon name="close" />
          </button>
        </div>
      ))}
    </div>
  );
}
