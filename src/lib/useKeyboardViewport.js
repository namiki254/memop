import { useEffect } from "react";

// 画面の高さがこれ以上（px）縮んだら，キーボードが出ているとみなす．
// アドレスバーの出入り程度の変化では反応しないよう，余裕を持たせている．
const KEYBOARD_MIN_HEIGHT = 120;

/**
 * スマホでキーボードが出ている間，アプリ全体の高さを「実際に見えている高さ」に合わせる．
 *
 * iOS Safari などは，キーボードが出ても 100dvh が縮まない．
 * そのままだと，画面の下に固定した保存ボタンやコメント欄がキーボードの裏に隠れる．
 * そこでキーボードが出ている間だけ，見えている高さを --app-height に入れ，
 * <html data-keyboard="open"> を付ける（index.css の .pin-sheet がこれを見て高さを変える）．
 * キーボードが閉じたら両方とも外し，CSS の 100dvh に任せる．
 */
export function useKeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame = null;
    let wasOpen = false;

    function apply() {
      frame = null;

      // ピンチで画面全体を拡大しているときも height は小さくなるので，
      // 拡大率を掛けて元の大きさに戻してから比べる．
      const visibleHeight = viewport.height * viewport.scale;
      const isOpen = window.innerHeight - visibleHeight > KEYBOARD_MIN_HEIGHT;

      if (!isOpen) {
        if (wasOpen) {
          root.style.removeProperty("--app-height");
          delete root.dataset.keyboard;
          wasOpen = false;
        }
        return;
      }

      root.style.setProperty("--app-height", `${Math.round(visibleHeight)}px`);
      root.dataset.keyboard = "open";

      // このアプリはページ全体をスクロールさせない作り（中の箱だけがスクロールする）．
      // キーボードが出た拍子にブラウザがページごとずらすことがあるので，元の位置に戻す．
      if (window.scrollY !== 0 || viewport.offsetTop !== 0) {
        window.scrollTo(0, 0);
      }

      // 高さが変わった直後に一度だけ，入力中の欄が見える位置までスクロールする
      if (!wasOpen) {
        wasOpen = true;
        document.activeElement?.scrollIntoView?.({ block: "nearest" });
      }
    }

    function schedule() {
      if (frame === null) frame = requestAnimationFrame(apply);
    }

    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    schedule();

    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      root.style.removeProperty("--app-height");
      delete root.dataset.keyboard;
    };
  }, []);
}
