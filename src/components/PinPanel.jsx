import { useEffect, useState } from "react";
import { PIN_TYPES, getPinEmoji } from "../lib/pinTypes";
import { renderTextWithLinks } from "../lib/linkify";
import { supabase } from "../lib/supabase";
import { getGithubUsername } from "../lib/displayName";

/**
 * ピンの入力・表示パネル．
 *
 * 画面の下（広い画面では右下）に固定で出る．
 *
 * props:
 *   pin        表示するピン．
 *              新しく作るときは座標だけが入った { x, y } を渡す（id が無い）．
 *              既にあるピンを見るときは pins テーブルの1行をそのまま渡す（id がある）．
 *   saving     保存中かどうか
 *   error      保存に失敗したときの文言
 *   mapOptions ボタン種類の移動先として選べるマップの一覧．[{ id, title }]（#67）
 *   onSave     { title, content, pinType, kind, linkMapId } を受け取って保存する．新規作成のときだけ使う
 *   onClose    閉じる
 *
 * id があるかどうかで «表示» と «新規作成» を切り替える．
 * 既存ピンの編集と削除はこのコンポーネントには入れていない（#40 の担当範囲）．
 *
 * kind が "button" のピンは，メモの代わりに「押すと別のマップへ移動する」
 * 動作を持つ．押したときの実際の移動処理は MapDetail.jsx 側（#67）で行う．
 */
// HTMLのmaxLengthはUTF-16のコード単位数で数えるため，家族・カップル等の
// 複数コードポイントからなる絵文字（ZWJ結合絵文字）が入力途中で分断され，
// 壊れた見た目になることがある．書記素クラスタ単位で数えて切り詰める．
function truncateToGraphemes(value, maxLength) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = Array.from(segmenter.segment(value), (s) => s.segment);
    return segments.slice(0, maxLength).join("");
  }
  return Array.from(value).slice(0, maxLength).join("");
}

export function PinPanel({
  pin,
  currentUser,
  saving = false,
  error = "",
  mapOptions = [],
  onSave,
  onClose,
  onNavigate,
  onPreviewChange,
  //  Update, Deleteを追加
  onUpdate,
  onDelete,
  isEditing,
  onEditStart,
  onEditCancel,
}) {
  const isNew = !pin?.id;

  // このピンを編集・削除できるか．
  // 持ち主なし（user_id が null）のピンは，ログイン済みなら誰でも編集・削除できる
  // （MapDetail.jsx の canEditPin と同じ扱い．マップ・フォルダの「持ち主なし」仕様に合わせている）．
  const isOwner = pin?.user_id === null
    ? Boolean(currentUser)
    : currentUser?.id === pin?.user_id;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinType, setPinType] = useState(PIN_TYPES[0].value);
  // ピンの種類（メモ／ボタン）と，ボタンのときの移動先（#67）
  const [kind, setKind] = useState("pin");
  const [linkMapId, setLinkMapId] = useState("");
  const [showOnlyMyMaps, setShowOnlyMyMaps] = useState(false);

  // コメント機能用のState
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState("");

  const visibleMapOptions = showOnlyMyMaps
    ? mapOptions.filter(
      (option) => option.user_id === currentUser?.id,
    )
    : mapOptions;

  const firstMapOptionId = visibleMapOptions[0]?.id ?? "";

  const selectedMapIsVisible = visibleMapOptions.some(
    (option) => option.id === linkMapId,
  );
  // 編集中のモードを追加
  const [customPinType, setCustomPinType] = useState("");

  // 別のピンを選び直したときに入力欄を作り直す．
  // pin.id が無い（新規作成）ときは座標を鍵にして，
  // 別の場所をクリックしたら空の状態に戻るようにする．
  const key = pin?.id ?? `${pin?.x}-${pin?.y}`;

  const [panelCollapsed, setPanelCollapsed] = useState(false);

  useEffect(() => {
    setPanelCollapsed(false);
  }, [key]);
  // ピンを選び直したときに入力欄に既存タイトルやメモが入るように変更
  //
  // mapOptions を依存に入れていないのは意図的．親（MapDetail.jsx）側で
  // allMaps.filter(...) を毎レンダー新しい配列として渡しているため，
  // 依存に入れると入力中も再実行されて選び直した内容が消えてしまう．
  useEffect(() => {
    setTitle(pin?.title ?? "");
    setContent(pin?.content ?? "");
    setKind(pin?.kind ?? "pin");
    setLinkMapId(pin?.link_map_id ?? "");
    // 既存4種類に含まれない場合は自由入力として扱う
    const isCustomPinType =
      pin?.pin_type &&
      !PIN_TYPES.some((type) => type.value === pin.pin_type);

    setPinType(
      isCustomPinType ? "custom" : pin?.pin_type ?? PIN_TYPES[0].value
    );
    setCustomPinType(isCustomPinType ? pin.pin_type : "");
  }, [
    key,
    pin?.title,
    pin?.content,
    pin?.pin_type,
    pin?.kind,
    pin?.link_map_id,
  ]);

  useEffect(() => {
    // 既存ボタンの編集時は、保存済みの移動先を絶対に変更しない
    if (!isNew) return;

    // 新規追加で未選択の場合だけ、先頭マップを選択する
    if (!linkMapId && firstMapOptionId) {
      setLinkMapId(firstMapOptionId);
    }
  }, [isNew, linkMapId, firstMapOptionId]);

  useEffect(() => {
    if (!isNew && !isEditing) return;

    const previewPinType =
      pinType === "custom"
        ? customPinType.trim() || PIN_TYPES[0].value
        : pinType;

    onPreviewChange?.({
      kind,
      pin_type: previewPinType,
    });
  }, [isNew, isEditing, kind, pinType, customPinType, onPreviewChange]);

  // コメントの取得とRealtime購読のセットアップ
  useEffect(() => {
    if (!pin?.id) {
      setComments([]);
      return;
    }

    let ignore = false;

    async function loadComments() {
      setLoadingComments(true);
      setCommentError("");
      const { data, error: fetchErr } = await supabase
        .from("pin_comments")
        .select("*")
        .eq("pin_id", pin.id)
        .order("created_at", { ascending: true });

      if (!ignore) {
        if (fetchErr) {
          console.error("コメントの取得に失敗", fetchErr);
          setCommentError("コメントの読み込みに失敗しました．");
        } else {
          setComments(data ?? []);
        }
        setLoadingComments(false);
      }
    }

    loadComments();

    // 他の人が投稿・削除したコメントを即座に反映する（Realtime）
    const channel = supabase
      .channel(`pin-comments-${pin.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pin_comments",
          filter: `pin_id=eq.${pin.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setComments((prev) =>
              prev.some((c) => c.id === payload.new.id)
                ? prev
                : [...prev, payload.new]
            );
          } else if (payload.eventType === "DELETE") {
            setComments((prev) => prev.filter((c) => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [pin?.id]);

  // コメントを追加する
  async function handleAddComment(e) {
    e.preventDefault();
    if (!newComment.trim() || submittingComment || !currentUser || !pin?.id) {
      return;
    }

    setSubmittingComment(true);
    setCommentError("");

    try {
      const { error: insertErr } = await supabase
        .from("pin_comments")
        .insert({
          pin_id: pin.id,
          user_id: currentUser.id,
          content: newComment.trim(),
          creator_username: getGithubUsername(currentUser),
        });

      if (insertErr) {
        console.error("コメントの送信に失敗", insertErr);
        setCommentError("コメントの送信に失敗しました．");
      } else {
        setNewComment("");
      }
    } catch (err) {
      console.error(err);
      setCommentError("予期せぬエラーが発生しました．");
    } finally {
      setSubmittingComment(false);
    }
  }

  // 自分のコメントを削除する（編集不可、削除のみ可）
  async function handleDeleteComment(commentId) {
    if (!window.confirm("このコメントを削除しますか？")) return;

    setCommentError("");
    const { error: deleteErr } = await supabase
      .from("pin_comments")
      .delete()
      .eq("id", commentId);

    if (deleteErr) {
      console.error("コメントの削除に失敗", deleteErr);
      setCommentError("コメントの削除に失敗しました．");
    }
  }

  // 新規作成（onSave）と更新（onUpdate）を切り替える
  function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    if (!title.trim()) return;
    if (kind === "button" && !linkMapId) return;
    // 自由入力が空欄の場合は保存しない（kind が button のときは pinType 自体を使わない）
    if (kind !== "button" && pinType === "custom" && !customPinType.trim()) {
      return;
    }

    // 自由入力の場合は，入力された文字をピンの種類として保存する
    const savedPinType =
      pinType === "custom" ? customPinType.trim() : pinType;

    const payload = {
      title: title.trim(),
      content: kind === "button" ? "" : content.trim(),
      pinType: savedPinType,
      kind,
      linkMapId: kind === "button" ? linkMapId : null,
    };

    // isNewか否かで呼び出す関数（onSave or onUpdate）切り替える
    if (isNew) {
      onSave?.(payload);
    } else {
      onUpdate?.(payload);
    }
  }

  function cancelEditing() {
    setTitle(pin?.title ?? "");
    setContent(pin?.content ?? "");
    setKind(pin?.kind ?? "pin");
    setLinkMapId(pin?.link_map_id ?? mapOptions[0]?.id ?? "");
    setShowOnlyMyMaps(false);

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

  const destinationMap = mapOptions.find(
    (option) => option.id === pin?.link_map_id,
  );

  const fieldClassName =
    "w-full rounded-xl border border-[#E9DAD5] bg-[#FFFCFA] px-3 py-2.5 text-sm text-[#3F3A3A] outline-none transition placeholder:text-[#B6AAAA] focus:border-[#F6A3AD] focus:ring-4 focus:ring-[#FFF0F1] disabled:bg-[#F4F0EE] disabled:text-[#9A908D]";

  return (
    <div
      className="
        fixed inset-x-0 bottom-0 z-40
        max-h-[85dvh] overflow-y-auto
        rounded-t-3xl
        border-t border-rose-100
        bg-white
        p-5
        shadow-xl

        sm:inset-x-auto
        sm:right-5
        sm:bottom-5
        sm:w-80
        sm:rounded-3xl
        sm:border
      "
    >
      <button
        type="button"
        onClick={() => setPanelCollapsed((current) => !current)}
        aria-expanded={!panelCollapsed}
        aria-controls="pin-panel-content"
        className="flex w-full items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-rose-100"
      >
        <span>
          {panelCollapsed
            ? isNew
              ? "ピンを追加中"
              : isEditing
                ? "ピンを編集中"
                : "ピンを表示中"
            : ""}
        </span>

        <span aria-hidden="true">
          {panelCollapsed ? "▲ 開く" : "▼ しまう"}
        </span>
      </button>

      <div
        id="pin-panel-content"
        className={panelCollapsed ? "hidden" : "mt-3"}
      >
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

            {/* ピンそのものの種類（メモ／ボタン）．#38の見た目の種類とは別軸． */}
            <div className="mt-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => setKind("pin")}
                disabled={saving}
                aria-pressed={kind === "pin"}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${kind === "pin"
                  ? "border-[#F47281] bg-[#FFF0F1] text-[#C95765]"
                  : "border-rose-100 bg-white text-[#817878] hover:bg-rose-50"
                  }`}
              >
                📍 メモ
              </button>
              <button
                type="button"
                onClick={() => setKind("button")}
                disabled={saving}
                aria-pressed={kind === "button"}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${kind === "button"
                  ? "border-[#7DCDB5] bg-[#EDF9F5] text-[#3E8D77]"
                  : "border-rose-100 bg-white text-[#817878] hover:bg-rose-50"
                  }`}
              >
                🔗 マップ移動
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
              placeholder={
                kind === "button"
                  ? "ボタンの名前（例：ララポートへ）"
                  : "タイトル（例：おすすめのカフェ）"
              }
              className="mt-2
            w-full
            border
            rounded-xl
            border-rose-100
            bg-rose-50/30
            focus:border-rose-300
            focus:ring-4
            focus:ring-rose-100
            outline-none
            px-3
            py-2
            text-sm
            disabled:bg-slate-100"
            />

            {kind === "button" ? (
              <>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[#685F5D]">
                  <input
                    type="checkbox"
                    checked={showOnlyMyMaps}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setShowOnlyMyMaps(checked);

                      if (!checked) return;

                      const myMaps = mapOptions.filter(
                        (option) => option.user_id === currentUser?.id,
                      );

                      const currentSelectionIsMine = myMaps.some(
                        (option) => option.id === linkMapId,
                      );

                      if (!currentSelectionIsMine) {
                        setLinkMapId(myMaps[0]?.id ?? "");
                      }
                    }}
                    disabled={saving || !currentUser}
                    className="h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-400"
                  />

                  自分が作成したマップのみ
                </label>

                {visibleMapOptions.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-[#F8F3F0] p-3 text-xs text-[#817878]">
                    {showOnlyMyMaps
                      ? "自分が作成したマップがありません．"
                      : "移動先に選べるマップがありません．"}
                  </p>
                ) : (
                  <select
                    value={linkMapId}
                    onChange={(event) =>
                      setLinkMapId(event.target.value)
                    }
                    disabled={saving}
                    className={`mt-3 ${fieldClassName}`}
                  >
                    {visibleMapOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.hierarchyLabel}
                      </option>
                    ))}
                  </select>
                )}
              </>

            ) : (
              <>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={saving}
                  maxLength={500}
                  rows={3}
                  placeholder="メモ（任意）"
                  className="mt-2 w-full rounded-xl border border-rose-100 bg-rose-50/30 px-3 py-2 text-sm outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-stone-100"
                />

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PIN_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setPinType(type.value)}
                      disabled={saving}
                      aria-pressed={pinType === type.value}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${type.value === pinType
                        ? "border-[#F47281] bg-[#FFF0F1] text-[#C95765]"
                        : "border-rose-100 bg-white text-[#817878] hover:bg-rose-50"
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
                    onChange={(e) => {
                      // 日本語入力（IME）の変換中に強制的に値を書き換えると，
                      // 変換候補ウィンドウが崩れることがあるため，変換確定後にだけ切り詰める．
                      if (e.nativeEvent.isComposing) {
                        setCustomPinType(e.target.value);
                        return;
                      }
                      setCustomPinType(truncateToGraphemes(e.target.value, 4));
                    }}
                    onCompositionEnd={(e) =>
                      setCustomPinType(truncateToGraphemes(e.target.value, 4))
                    }
                    disabled={saving}
                    placeholder="例：🐱 / 猫"
                    className="mt-2 w-full rounded-xl border border-rose-100 bg-rose-50/30 px-3 py-2 text-sm outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:bg-stone-100"
                  />
                )}
              </>
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
                (kind === "button" && !linkMapId) ||
                (kind !== "button" &&
                  pinType === "custom" &&
                  customPinType.trim() === "")
              }
              className="mt-4 w-full rounded-full bg-[#F47281] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#E95F70] disabled:bg-stone-300"
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
            {!saving && title.trim() !== "" && kind === "button" && !linkMapId && (
              <p className="mt-2 text-xs text-slate-500">
                移動先のマップを選ぶと保存できます．
              </p>
            )}
          </form>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-bold break-words text-[#3F3A3A]">
                  {pin.kind === "button" ? "🔗" : getPinEmoji(pin.pin_type)}{" "}
                  {pin.title}
                </p>

                {pin.creator_username && (
                  <span className="shrink-0 text-xs font-medium text-slate-400">
                    @{pin.creator_username.replace(/^@/, "")}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 text-sm text-slate-500 underline"
              >
                閉じる
              </button>
            </div>

            {/* 通常はここに来ない．ボタンは押した瞬間に移動するので，
              このビューが出るのは移動先マップが消えて壊れているときだけ． */}
            {pin.kind === "button" ? (
              pin.link_map_id ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.(pin.link_map_id)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7DCDB5] px-5 py-3.5 text-sm font-black text-white shadow-[0_7px_18px_rgba(125,205,181,0.35)] transition hover:-translate-y-0.5 hover:bg-[#65BDA3]"
                >
                  <span aria-hidden="true">🚪</span>
                  <span>
                    {destinationMap
                      ? `${destinationMap.title}へ移動`
                      : "移動先のマップへ"}
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ) : (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">
                  移動先のマップが見つかりません。編集して選び直してください。
                </p>
              )
            ) : pin.content ? (
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
                  className="rounded border border-red-200 px-3 py-1.5 text-xs text-[#C95765] hover:bg-red-50 disabled:opacity-50"
                >
                  削除
                </button>
              </div>
            )}

            {/* コメント表示エリア */}
            <div className="mt-5 border-t border-rose-100 pt-4">
              <h4 className="text-xs font-bold text-slate-600">
                💬 コメント ({comments.length})
              </h4>

              {commentError && (
                <p className="mt-2 rounded bg-red-50 p-1.5 text-xs text-red-600">
                  {commentError}
                </p>
              )}

              {/* コメント一覧表示 */}
              <div className="mt-2 max-h-40 overflow-y-auto space-y-2 pr-1">
                {loadingComments ? (
                  <p className="text-xs text-slate-400">読み込み中...</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    コメントはまだありません
                  </p>
                ) : (
                  comments.map((comment) => {
                    const isMyComment = currentUser?.id === comment.user_id;

                    return (
                      <div
                        key={comment.id}
                        className="flex items-start justify-between gap-2 rounded-xl bg-rose-50/50 p-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-600 truncate">
                              {comment.creator_username
                                ? `@${comment.creator_username.replace(/^@/, "")}`
                                : "名無し"}
                            </span>
                            <span>•</span>
                            <span>
                              {new Date(comment.created_at).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" }
                              )}
                            </span>
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-700">
                            {comment.content}
                          </p>
                        </div>

                        {/* 編集は不可とし、自分のコメントのみ削除ボタンを表示 */}
                        {isMyComment && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(comment.id)}
                            className="shrink-0 text-[10px] text-slate-400 hover:text-red-500"
                            title="コメントを削除"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* コメント入力フォーム */}
              {currentUser ? (
                <form
                  onSubmit={handleAddComment}
                  className="mt-3 flex gap-2"
                >
                  <input
                    type="text"
                    placeholder="コメントを入力..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    disabled={submittingComment}
                    maxLength={200}
                    className="flex-1 rounded-xl border border-rose-100 bg-rose-50/30 px-3 py-1.5 text-xs outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 disabled:bg-stone-100"
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.trim()}
                    className="shrink-0 rounded-full bg-[#F47281] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#E95F70] disabled:bg-stone-300"
                  >
                    送信
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-xs italic text-slate-400">
                  コメントを投稿するにはログインが必要です
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}