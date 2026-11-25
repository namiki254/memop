/**
 * プログラムからスクロールさせるときの動かし方．
 *
 * ふだんは目で追えるようになめらかに動かす．
 * 端末の「視差効果を減らす」などの設定が有効な人には，酔いの原因になりうるので一瞬で移動する．
 *
 * 使い方: element.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
 */
export function scrollBehavior() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduced ? "auto" : "smooth";
}
