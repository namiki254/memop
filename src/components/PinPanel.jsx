import { useEffect, useState } from "react";
import { PIN_TYPES, getPinEmoji } from "../lib/pinTypes";
// 追加
import { renderTextWithLinks } from "../lib/linkify";

/**
 * ピンの入力・表示パネル．
 *
 * 画面の下（広い画面では右下）に固定で出る．
 *
 * props:
 *   pin      表示するピン．
 *            新しく作るときは座標だけが入った { x, y } を渡す（id が無い）．
 *            既にあるピンを見るときは pins テーブルの1行をそのまま渡す（id がある）．
 *   saving   保存中かどうか
 *   error    保存に失敗したときの文言
 *   onSave   { title, content, pinType } を受け取って保存する．新規作成のときだけ使う
 *   onClose  閉じる
 *
 * id があるかどうかで «表示» と «新規作成» を切り替える．
 * 既存ピンの編集と削除はこのコンポーネントには入れていない（#40 の担当範囲）．
 */
export function PinPanel({
  pin,
  currentUser,
  saving = false,
  error = "",
  onSave,
  onClose,
  //  Update, Deleteを追加
  onUpdate,
  onDelete,
  isEditing,
  onEditStart,
  onEditCancel,
}) {
  const isNew = !pin?.id;

  // 今ログインしている人が、このピンの作成者かどうか
  const isOwner = currentUser?.id === pin?.user_id;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinType, setPinType] = useState(PIN_TYPES[0].value);
  // 編集中のモードを追加
  const [customPinType, setCustomPinType] = useState("");

  // 別のピンを選び直したときに入力欄を作り直す．
  // pin.id が無い（新規作成）ときは座標を鍵にして，
  // 別の場所をクリックしたら空の状態に戻るようにする．
  const key = pin?.id ?? `${pin?.x}-${pin?.y}`;

  // ピンを選び直したときに入力欄に既存タイトルやメモが入るように変更
  useEffect(() => {
    setTitle(pin?.title ?? "");
    setContent(pin?.content ?? "");

    // 既存4種類に含まれない場合は自由入力として扱う
    const isCustomPinType =
      pin?.pin_type &&
      !PIN_TYPES.some((type) => type.value === pin.pin_type);

    setPinType(
      isCustomPinType ? "custom" : pin?.pin_type ?? PIN_TYPES[0].value
    );
    setCustomPinType(isCustomPinType ? pin.pin_type : "");
  }, [key])

  // 新規作成（onSave）と更新（onUpdate）を切り替える
  function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    if (!title.trim()) return;
    // isNewか否かで呼び出す関数（onSave or onUpdate）切り替える
    // 自由入力の場合は、入力された文字をピンの種類として保存する
    const savedPinType =
      pinType === "custom" ? customPinType.trim() : pinType;
    // 自由入力が空欄の場合は保存しない
    if (pinType === "custom" && !customPinType.trim()) return;
    if (isNew) {
      onSave?.({ title: title.trim(), content: content.trim(), pinType: savedPinType });
    } else {
      onUpdate?.({ title: title.trim(), content: content.trim(), pinType: savedPinType });
    }
  }

  function cancelEditing() {
    setTitle(pin?.title ?? "");
    setContent(pin?.content ?? "");
    // 既存4種類に含まれない場合は自由入力として元に戻す
    const isCustomPinType =
      pin?.pin_type &&
      !PIN_TYPES.some((type) => type.value === pin.pin_type);
    setPinType(
      isCustomPinType ? "custom" : pin?.pin_type ?? PIN_TYPES[0].value
    );
    setCustomPinType(isCustomPinType ? pin.pin_type : "");
    onEditCancel?.();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80 sm:rounded sm:border">
      {/* フォームを表示する条件にisEditingも追加 */}
      {isNew || isEditing ? ( // ★ isEditing も追加
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between">
            {/* 見出しを切り替える */}
            <p className="font-bold text-slate-800">
              {isNew ? "ここにピンを立てる" : "ピンを編集"}
            </p>
            <button
              type="button"
              // キャンセル時の動きを切り替える
              onClick={isNew ? onClose : cancelEditing}
              disabled={saving}
              className="text-sm text-slate-500 underline disabled:opacity-50"
            >
              キャンセル
            </button>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // 日本語の変換を確定する Enter で送信されないようにする
              if (e.key === "Enter" && e.nativeEvent.isComposing) {
                e.preventDefault();
              }
            }}
            disabled={saving}
            maxLength={100}
            placeholder="タイトル（例：おすすめのカフェ）"
            className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={saving}
            maxLength={500}
            rows={3}
            placeholder="メモ（任意）"
            className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            {PIN_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setPinType(type.value)}
                disabled={saving}
                aria-pressed={pinType === type.value}
                className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${pinType === type.value
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 text-slate-600"
                  }`}
              >
                {type.emoji} {type.label}
              </button>
            ))}
            {/* 自由入力を選択するボタン */}
            <button
              type="button"
              onClick={() => setPinType("custom")}
              disabled={saving}
              aria-pressed={pinType === "custom"}
              className={`rounded-full border px-2.5 py-1 text-xs disabled:opacity-50 ${pinType === "custom"
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-300 text-slate-600"
                }`}
            >
              ✏️ 自由入力
            </button>
          </div>
          {/* 自由入力を選んだときだけ入力欄を表示する */}
          {pinType === "custom" && (
            <input
              type="text"
              value={customPinType}
              onChange={(e) => setCustomPinType(e.target.value)}
              disabled={saving}
              maxLength={4}
              placeholder="例：🐱 / 猫"
              className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          )}
          {error && (
            <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              saving ||
              title.trim() === "" ||
              (pinType === "custom" && customPinType.trim() === "")
            }
            className="mt-3 w-full rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {/* {saving ? "保存中..." : "このピンを保存"} */}
            {/* 保存ボタンのテキストを切り替える */}
            {saving ? "保存中..." : isNew ? "このピンを保存" : "変更を保存"}
          </button>

          {!saving && title.trim() === "" && (
            <p className="mt-2 text-xs text-slate-500">
              タイトルを入れると保存できます．
            </p>
          )}
        </form>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold break-words text-slate-800">
              {getPinEmoji(pin.pin_type)} {pin.title}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-sm text-slate-500 underline"
            >
              閉じる
            </button>
          </div>

          {pin.content ? (
            <p className="mt-2 text-sm break-words whitespace-pre-wrap text-slate-600">
              {/* {pin.content} */}
              {/* urlを識別、リンクを付与する関数で返す */}
              {renderTextWithLinks(pin.content)}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">メモはありません．</p>
          )}
          {/* エラーメッセージの表示 */}
          {error && (
            <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {/* 編集、削除ボタン */}
          {isOwner && (
            <div className="mt-4 flex justify-between border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={onEditStart}
                disabled={saving}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                編集
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                削除
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
