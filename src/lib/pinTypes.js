/**
 * ピンの種類の一覧．
 *
 * MapView.jsx（見た目の切り替え）と PinPanel.jsx（選択欄）の両方から使うので，
 * ここに1箇所だけ定義する．
 *
 * "default" は，これまで pin_type に自動で入っていた値．
 * 既存のピンを壊さないよう一覧の中に残し，これまでと同じ📍を割り当てている．
 */
export const PIN_TYPES = [
  { value: "default", label: "メモ", emoji: "📍" },
  { value: "recommend", label: "おすすめ", emoji: "⭐" },
  { value: "photo", label: "写真スポット", emoji: "📷" },
  { value: "caution", label: "注意", emoji: "⚠️" },
];

const EMOJI_BY_TYPE = Object.fromEntries(
  PIN_TYPES.map((type) => [type.value, type.emoji]),
);

const FALLBACK_EMOJI = "📍";

/**
 * pin_type に対応する絵文字を返す．
 * 一覧にある種類は対応する絵文字を返し，
 * 自由入力された値はそのまま表示する．
 * 値が無い場合だけ📍にフォールバックする．
 */
export function getPinEmoji(pinType) {
  // pinType が空文字のときは "自由入力なし" と同じ扱いにする．
  // ?? だと空文字はそのまま素通りしてしまい，見えないピンになるため || を使う．
  return EMOJI_BY_TYPE[pinType] || pinType || FALLBACK_EMOJI;
}
