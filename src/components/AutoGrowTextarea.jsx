import { useLayoutEffect, useRef } from "react";

/**
 * 入力した文章の量に合わせて高さが伸びる textarea．
 *
 * 1行のままだと長い文章を見直しづらいので，コメント欄などで使う．
 * 伸びすぎて画面を占領しないよう，上限は className の max-h-* で決める
 * （上限を超えた分は欄の中でスクロールする）．
 *
 * ref を渡すと textarea 本体を参照できる（フォーカスを当てたいとき用）．
 */
export default function AutoGrowTextarea({ value, ref, className = "", ...props }) {
  const innerRef = useRef(null);

  useLayoutEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    // いったん縮めてから測らないと，文字を消したときに高さが戻らない．
    element.style.height = "auto";
    const border = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + border}px`;
  }, [value]);

  return (
    <textarea
      ref={(element) => {
        innerRef.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      value={value}
      rows={1}
      className={`resize-none ${className}`}
      {...props}
    />
  );
}
