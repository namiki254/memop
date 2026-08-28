/**
 * 検索用に文字列の表記揺れを整える．
 *
 * NFKC正規化＋小文字化＋カタカナ→ひらがな変換を行うことで，
 * 全角/半角・大文字/小文字・カタカナ/ひらがなの違いを無視して比較できるようにする．
 * マップ・フォルダ検索（MapList.jsx）とピンタイトル検索（MapDetail.jsx）の両方で使う．
 */
export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    );
}
