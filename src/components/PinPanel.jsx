import { useEffect, useRef, useState } from "react";
import { PIN_TYPES, getPinEmoji } from "../lib/pinTypes";
import { renderTextWithLinks } from "../lib/linkify";
import { supabase } from "../lib/supabase";
import { getGithubUsername } from "../lib/displayName";
import { canManageContent } from "../lib/mapAccess";
import { ADMIN_COMMENT_DELETE_UNAVAILABLE_MESSAGE, deleteCommentAsAdmin } from "../lib/pinComments";
import CommentEditor from "./CommentEditor.jsx";
import AutoGrowTextarea from "./AutoGrowTextarea.jsx";
import Icon from "./Icon.jsx";
import { TABELOG_URL_MAX_LENGTH, isTabelogUrl, normalizeTabelogUrl } from "../lib/tabelogUrl.js";
import { scrollBehavior } from "../lib/motion.js";

/**
 * ピンの入力・表示パネル．
 *
 * スマホでは地図の下に並び，広い画面では地図の右下に浮かぶ．
 *
 * props:
 *   pin        表示するピン．
 *              新しく作るときは座標だけが入った { x, y } を渡す（id が無い）．
 *              既にあるピンを見るときは pins テーブルの1行をそのまま渡す（id がある）．
 *   saving     保存中かどうか
 *   error      保存に失敗したときの文言
 *   mapOptions ボタン種類の移動先として選べるマップの一覧．[{ id, title }]（#67）
 *   onSave     { title, content, pinType, kind, linkMapId, tabelogUrl } を受け取って保存する．新規作成のときだけ使う
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
  focusedCommentId = null,
  onFocusedCommentDeleted,
  currentUser,
  isAdmin = false,
  canManagePin,
  saving = false,
  error = "",
  mapOptions = [],
  readableMaps = mapOptions,
  onSave,
  onClose,
  onNavigate,
  onPreviewChange,
  onUpdate,
  onDelete,
  isEditing,
  onEditStart,
  onEditCancel,
}) {
  const isNew = !pin?.id;
  const currentUserId = currentUser?.id;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinType, setPinType] = useState(PIN_TYPES[0].value);
  // ピンの種類（メモ／ボタン）と，ボタンのときの移動先（#67）
  const [kind, setKind] = useState("pin");
  const [linkMapId, setLinkMapId] = useState("");
  const [showOnlyMyMaps, setShowOnlyMyMaps] = useState(false);
  // 食べログの店舗ページ URL（任意，#5）
  const [tabelogUrl, setTabelogUrl] = useState("");
  const normalizedTabelogUrl = normalizeTabelogUrl(tabelogUrl);
  const tabelogUrlInvalid = normalizedTabelogUrl !== null && !isTabelogUrl(normalizedTabelogUrl);

  // コメント機能用のState
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [commentError, setCommentError] = useState("");
  const focusedCommentRef = useRef(null);
  const hasFocusedComment = focusedCommentId !== null
    && comments.some((comment) => String(comment.id) === focusedCommentId);

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
    setTabelogUrl(pin?.tabelog_url ?? "");
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
    pin?.tabelog_url,
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
    setEditingCommentId(null);
    if (!pin?.id) {
      setComments([]);
      return;
    }

    let ignore = false;
    let controller;

    async function loadComments(showLoading = true) {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      if (showLoading) setLoadingComments(true);
      setCommentError("");
      const { data, error: fetchErr } = await supabase
        .from("pin_comments")
        .select("*")
        .eq("pin_id", pin.id)
        .order("created_at", { ascending: true })
        .abortSignal(signal);
      if (ignore || signal.aborted) return;

      let loadedComments = data ?? [];
      let loadError = fetchErr;
      if (!ignore && !loadError && focusedCommentId
        && !loadedComments.some((comment) => String(comment.id) === focusedCommentId)) {
        // 一覧の取得上限より後にあるコメントも、リンク先のピンに絞って取得する。
        const { data: linkedComment, error: linkedCommentError } = await supabase
          .from("pin_comments")
          .select("*")
          .eq("pin_id", pin.id)
          .eq("id", focusedCommentId)
          .maybeSingle()
          .abortSignal(signal);
        if (linkedComment) loadedComments = [...loadedComments, linkedComment];
        if (linkedCommentError && linkedCommentError.code !== "22P02") loadError = linkedCommentError;
      }

      if (!ignore && !signal.aborted) {
        if (loadError) {
          console.error("コメントの取得に失敗", loadError);
          setCommentError("コメントの読み込みに失敗しました．");
        } else {
          setComments(loadedComments);
        }
        setLoadingComments(false);
      }
    }

    loadComments();

    // 未ログインの共有閲覧では、HTTPリクエストで共有キーを提示して更新を確認する。
    // 変更通知の接続には共有キーを含められないため、表示中だけ定期的に取得する。
    if (!currentUserId) {
      const refreshComments = () => {
        if (document.visibilityState === "visible") loadComments(false);
      };
      const interval = window.setInterval(refreshComments, 10000);
      window.addEventListener("focus", refreshComments);
      return () => {
        ignore = true;
        controller?.abort();
        window.clearInterval(interval);
        window.removeEventListener("focus", refreshComments);
      };
    }

    // 他の人が投稿・編集・削除したコメントを即座に反映する（Realtime）
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
          } else if (payload.eventType === "UPDATE") {
            setComments((previous) =>
              previous.map((comment) => comment.id === payload.new.id
                ? { ...comment, content: payload.new.content }
                : comment),
            );
          } else if (payload.eventType === "DELETE") {
            setComments((prev) => prev.filter((c) => c.id !== payload.old.id));
            setEditingCommentId((current) => current === payload.old.id ? null : current);
          }
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      controller?.abort();
      supabase.removeChannel(channel);
    };
  }, [pin?.id, focusedCommentId, currentUserId]);

  useEffect(() => {
    // 投稿先を開いたとき、長いコメント一覧でも対象が見える位置に移動する。
    if (!loadingComments && hasFocusedComment && !isEditing) {
      focusedCommentRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
      focusedCommentRef.current?.focus({ preventScroll: true });
    }
  }, [focusedCommentId, hasFocusedComment, loadingComments, isEditing]);

  // コメントを追加する
  async function handleAddComment(e) {
    e.preventDefault();
    if (!newComment.trim() || submittingComment || !currentUser || !pin?.id) {
      return;
    }

    setSubmittingComment(true);
    setCommentError("");

    try {
      const { data: createdComment, error: insertErr } = await supabase
        .from("pin_comments")
        .insert({
          pin_id: pin.id,
          user_id: currentUser.id,
          content: newComment.trim(),
          creator_username: getGithubUsername(currentUser),
        })
        .select()
        .single();

      if (insertErr) {
        console.error("コメントの送信に失敗", insertErr);
        setCommentError("コメントの送信に失敗しました．");
      } else {
        // 自分の投稿は変更通知を待たずに表示する。
        setComments((previous) => previous.some((comment) => comment.id === createdComment.id)
          ? previous : [...previous, createdComment]);
        setNewComment("");
      }
    } catch (err) {
      console.error(err);
      setCommentError("予期せぬエラーが発生しました．");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDeleteComment(comment) {
    if (deletingCommentId !== null || !canManageContent(comment, currentUser?.id, isAdmin)) return;
    if (!window.confirm("このコメントを削除しますか？")) return;

    setDeletingCommentId(comment.id);
    setCommentError("");
    // 自分の投稿には既存の削除ルールを使い、他の人の投稿は管理者用の関数で削除する。
    const isOwnComment = comment.user_id === currentUser.id;
    const { data, error: deleteErr } = isOwnComment
      ? await supabase.from("pin_comments").delete()
        .eq("id", comment.id).eq("user_id", currentUser.id).select("id").maybeSingle()
      : await deleteCommentAsAdmin(comment.id);

    if (deleteErr?.code === "PGRST202" && !isOwnComment) {
      setCommentError(ADMIN_COMMENT_DELETE_UNAVAILABLE_MESSAGE);
    } else if (deleteErr || (isOwnComment && !data)) {
      console.error("コメントの削除に失敗", deleteErr);
      setCommentError("コメントを削除できませんでした。再読み込みして最新のコメントを確認してください。");
    } else {
      // 変更通知を待たず、削除結果を開いているピンの一覧に反映する。
      setComments((previous) => previous.filter((item) => item.id !== comment.id));
      if (String(comment.id) === focusedCommentId) onFocusedCommentDeleted?.(comment.id);
    }
    setDeletingCommentId(null);
  }

  function handleCommentSaved(commentId, content, originalContent) {
    // 変更通知でもっと新しい本文を受け取っていた場合は、その表示を維持する。
    setComments((previous) => previous.map((comment) =>
      comment.id === commentId && comment.content === originalContent ? { ...comment, content } : comment,
    ));
    setEditingCommentId((current) => current === commentId ? null : current);
  }

  // 新規作成（onSave）と更新（onUpdate）を切り替える
  function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    if (!title.trim()) return;
    // 非公開化などで候補から外れた既存の移動先も、そのまま保存させない。
    if (kind === "button" && !selectedMapIsVisible) return;
    // 自由入力が空欄の場合は保存しない（kind が button のときは pinType 自体を使わない）
    if (kind !== "button" && pinType === "custom" && !customPinType.trim()) {
      return;
    }
    // 食べログ URL は任意だが，入力した場合は食べログのページだけを受け付ける
    if (kind !== "button" && tabelogUrlInvalid) return;

    // 自由入力の場合は，入力された文字をピンの種類として保存する
    const savedPinType =
      pinType === "custom" ? customPinType.trim() : pinType;

    const payload = {
      title: title.trim(),
      content: kind === "button" ? "" : content.trim(),
      pinType: savedPinType,
      kind,
      linkMapId: kind === "button" ? linkMapId : null,
      tabelogUrl: kind === "button" ? null : normalizedTabelogUrl,
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
    setTabelogUrl(pin?.tabelog_url ?? "");
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

  const destinationMap = readableMaps.find(
    (option) => option.id === pin?.link_map_id,
  );

  const panelTitle = isNew ? "ピンを追加" : isEditing ? "ピンを編集" : pin.title;
  const chipClassName = (selected) =>
    `min-h-10 rounded-lg border px-3 text-sm transition-colors disabled:opacity-50 sm:min-h-8 sm:px-2.5 sm:text-xs ${selected
      ? "border-accent bg-accent-soft font-bold text-accent-strong"
      : "border-line-strong bg-surface text-sub hover:text-ink"
    }`;

  return (
    // スマホでは地図の下に並べて置く（地図に重ねない）．こうすると地図の表示領域が縮むだけで，
    // ピンを立てる場所がパネルの裏に隠れない．広い画面では地図の右下に浮かべる．
    // 高さの上限は index.css の .pin-sheet で決めている（キーボードが出ている間は広げるため）．
    <div
      className="
        pin-sheet relative z-30 flex shrink-0 flex-col
        border-t border-line bg-surface

        sm:absolute sm:bottom-4 sm:right-4 sm:w-80
        sm:rounded-xl sm:border sm:shadow-lg
      "
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-line py-1 pl-4 pr-1.5">
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
          {!isNew && !isEditing && (
            <span aria-hidden="true" className="mr-1.5">
              {pin.kind === "button" ? "🚪" : getPinEmoji(pin.pin_type)}
            </span>
          )}
          {panelTitle}
        </p>

        <button
          type="button"
          onClick={() => setPanelCollapsed((current) => !current)}
          aria-expanded={!panelCollapsed}
          aria-controls="pin-panel-content"
          aria-label={panelCollapsed ? "パネルを開く" : "パネルをしまう"}
          title={panelCollapsed ? "開く" : "しまう"}
          className="btn-icon"
        >
          <Icon name={panelCollapsed ? "chevronUp" : "chevronDown"} className="size-5" />
        </button>

        <button
          type="button"
          // 追加中は閉じる，編集中は編集をやめて表示に戻る
          onClick={isNew || !isEditing ? onClose : cancelEditing}
          disabled={saving}
          aria-label={isNew ? "追加をやめる" : isEditing ? "編集をやめる" : "閉じる"}
          title={isNew || isEditing ? "キャンセル" : "閉じる"}
          className="btn-icon"
        >
          <Icon name="close" className="size-5" />
        </button>
      </div>

      <div
        id="pin-panel-content"
        className={panelCollapsed ? "hidden" : "min-h-0 flex-1 overflow-y-auto overscroll-contain"}
      >
        {/* フォームを表示する条件にisEditingも追加 */}
        {isNew || isEditing ? (
          <form onSubmit={handleSubmit}>
            <div className="space-y-3 px-4 py-3">
              {isEditing && (
                <p className="text-xs text-sub">
                  地図上のピンをドラッグすると位置を動かせます。
                </p>
              )}

              {/* ピンそのものの種類（メモ／ボタン）．#38の見た目の種類とは別軸． */}
              <div role="group" aria-label="ピンの種類" className="flex rounded-lg border border-line-strong p-0.5">
                {[["pin", "ピン"], ["button", "マップ移動"]].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    disabled={saving}
                    aria-pressed={kind === value}
                    className={`min-h-10 flex-1 rounded-md text-sm disabled:opacity-50 sm:min-h-8 ${kind === value
                      ? "bg-ink font-bold text-white"
                      : "text-sub hover:text-ink"
                      }`}
                  >
                    {label}
                  </button>
                ))}
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
                aria-label={kind === "button" ? "ボタンの名前" : "タイトル"}
                placeholder={
                  kind === "button"
                    ? "ボタンの名前（例：ララポートへ）"
                    : "タイトル（例：おすすめのカフェ）"
                }
                className="field"
              />

              {kind === "button" ? (
                <>
                  <p className="text-xs leading-relaxed text-sub">
                    移動先には、自分が作成したマップと保存したマップのうち、閲覧できる公開・URL限定公開マップを選べます。
                  </p>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink sm:min-h-8">
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
                      className="size-4 shrink-0 accent-accent"
                    />

                    自分が作成したマップのみ
                  </label>

                  {visibleMapOptions.length === 0 ? (
                    <p className="rounded-lg bg-paper p-3 text-xs text-sub">
                      {showOnlyMyMaps
                        ? "自分が作成したマップがありません．"
                        : "移動先に選べるマップがありません．"}
                    </p>
                  ) : (
                    <select
                      aria-label="移動先のマップ"
                      value={selectedMapIsVisible ? linkMapId : ""}
                      onChange={(event) =>
                        setLinkMapId(event.target.value)
                      }
                      disabled={saving}
                      className="field"
                    >
                      {/* 保存済みの移動先が候補にない場合、別のマップを勝手に選ばせない。 */}
                      <option value="" disabled>移動先のマップを選んでください</option>
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
                  <AutoGrowTextarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={saving}
                    maxLength={500}
                    aria-label="メモ"
                    placeholder="メモ（任意）"
                    className="field max-h-40 min-h-16"
                  />

                  <div>
                    <p className="text-xs font-bold text-sub">アイコン</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {PIN_TYPES.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setPinType(type.value)}
                          disabled={saving}
                          aria-pressed={pinType === type.value}
                          className={chipClassName(type.value === pinType)}
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
                        className={chipClassName(pinType === "custom")}
                      >
                        自由入力
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
                        aria-label="ピンに表示する文字（4文字まで）"
                        placeholder="絵文字か文字を4文字まで（例：🐱 / 猫）"
                        className="field mt-2"
                      />
                    )}
                  </div>

                  {/* 食べログの店舗ページ URL（任意，#5） */}
                  <div>
                    <label htmlFor="pin-tabelog-url" className="text-xs font-bold text-sub">
                      食べログのURL（任意）
                    </label>
                    <input
                      id="pin-tabelog-url"
                      type="url"
                      inputMode="url"
                      value={tabelogUrl}
                      onChange={(e) => setTabelogUrl(e.target.value)}
                      disabled={saving}
                      maxLength={TABELOG_URL_MAX_LENGTH}
                      placeholder="https://tabelog.com/…"
                      aria-invalid={tabelogUrlInvalid}
                      aria-describedby="pin-tabelog-url-hint"
                      className={`field mt-1 ${tabelogUrlInvalid ? "border-danger" : ""}`}
                    />
                    <p
                      id="pin-tabelog-url-hint"
                      className={`mt-1 text-xs leading-relaxed ${tabelogUrlInvalid ? "text-danger" : "text-faint"}`}
                    >
                      {tabelogUrlInvalid
                        ? "食べログの店舗ページの URL（https://tabelog.com/ で始まるもの）を入れてください。"
                        : "飲食店なら、店舗ページへのリンクをピンに付けられます。"}
                    </p>
                  </div>
                </>
              )}

              {error && (
                <p className="notice-error">
                  {error}
                </p>
              )}
            </div>

            {/* 保存ボタンは下に固定して，フォームが長くてもスクロールせずに押せるようにする */}
            <div className="sticky bottom-0 border-t border-line bg-surface px-4 py-2.5">
              <button
                type="submit"
                disabled={
                  saving ||
                  title.trim() === "" ||
                  (kind === "button" && !selectedMapIsVisible) ||
                  (kind !== "button" &&
                    pinType === "custom" &&
                    customPinType.trim() === "") ||
                  (kind !== "button" && tabelogUrlInvalid)
                }
                className="btn btn-primary w-full"
              >
                {/* 保存ボタンのテキストを切り替える */}
                {saving ? "保存中..." : isNew ? "このピンを保存" : "変更を保存"}
              </button>

              {!saving && title.trim() === "" && (
                <p className="mt-1.5 text-center text-xs text-sub">
                  {kind === "button" ? "ボタンの名前" : "タイトル"}を入れると保存できます。
                </p>
              )}
              {!saving && title.trim() !== "" && kind === "button" && !selectedMapIsVisible && (
                <p className="mt-1.5 text-center text-xs text-sub">
                  移動先のマップを選ぶと保存できます。
                </p>
              )}
            </div>
          </form>
        ) : (
          <div className="px-4 py-3">
            {pin.creator_username && (
              <p className="mb-1 text-xs text-faint">
                @{pin.creator_username.replace(/^@/, "")}
              </p>
            )}

            {/* 通常はここに来ない．ボタンは押した瞬間に移動するので，
              このビューが出るのは移動先マップが消えて壊れているときだけ． */}
            {pin.kind === "button" ? (
              pin.link_map_id ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.(pin.link_map_id)}
                  // 閲覧権限がない、非公開、削除済みの移動先にはボタンからも移動させない。
                  disabled={!destinationMap}
                  className="btn btn-primary w-full whitespace-normal py-2"
                >
                  <span className="min-w-0 break-words">
                    {destinationMap
                      ? `${destinationMap.title}へ移動`
                      : "移動先を利用できません"}
                  </span>
                  {destinationMap && <Icon name="arrowRight" />}
                </button>
              ) : (
                <p className="notice-error">
                  移動先のマップが見つかりません。編集して選び直してください。
                </p>
              )
            ) : pin.content ? (
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-ink">
                {/* urlを識別、リンクを付与する関数で返す */}
                {renderTextWithLinks(pin.content)}
              </p>
            ) : (
              <p className="text-sm text-faint">メモはありません。</p>
            )}
            {/* 食べログの店舗ページ（#5）．食べログ以外の URL は保存時にも弾くが，念のため表示前にも確かめる */}
            {pin.kind !== "button" && isTabelogUrl(pin.tabelog_url) && (
              <a
                href={pin.tabelog_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm mt-3"
              >
                食べログで見る
                <Icon name="external" />
                <span className="sr-only">（新しいタブで開きます）</span>
              </a>
            )}
            {/* エラーメッセージの表示 */}
            {error && (
              <p className="notice-error mt-2">
                {error}
              </p>
            )}
            {/* 編集、削除ボタン */}
            {canManagePin && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onEditStart}
                  disabled={saving}
                  className="btn btn-sm"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={saving}
                  className="btn btn-sm btn-danger"
                >
                  削除
                </button>
              </div>
            )}

            {/* コメント表示エリア */}
            <div className="mt-4 border-t border-line pt-3">
              <h4 className="text-xs font-bold text-sub">
                コメント {comments.length > 0 && <span className="font-normal">{comments.length}件</span>}
              </h4>

              {commentError && (
                <p className="notice-error mt-2">
                  {commentError}
                </p>
              )}

              {focusedCommentId && !loadingComments && !hasFocusedComment && !commentError && (
                <p role="status" className="mt-2 text-xs text-sub">
                  このリンクで指定されたコメントは表示できません。
                  {comments.length > 0 && " 下には、このピンの他のコメントを表示しています。"}
                </p>
              )}

              {/* コメント一覧表示 */}
              <div className="mt-1">
                {loadingComments ? (
                  <p className="py-2 text-xs text-faint">読み込み中...</p>
                ) : comments.length === 0 ? (
                  <p className="py-2 text-xs text-faint">
                    コメントはまだありません
                  </p>
                ) : (
                  comments.map((comment) => {
                    const canManageComment = canManageContent(comment, currentUser?.id, isAdmin);
                    const isEditingComment = canManageComment && editingCommentId === comment.id;
                    const commentActionsDisabled = deletingCommentId !== null || editingCommentId !== null;
                    const isFocused = String(comment.id) === focusedCommentId;

                    return (
                      <div
                        key={comment.id}
                        ref={isFocused ? focusedCommentRef : null}
                        tabIndex={isFocused ? -1 : undefined}
                        className={`border-b border-line py-2 last:border-b-0 ${isFocused ? "-mx-2 rounded-lg border-b-transparent bg-accent-soft px-2" : ""}`}
                      >
                        <div className="flex items-baseline gap-2 text-xs text-faint">
                          <span className="min-w-0 truncate font-bold text-sub">
                            {comment.creator_username
                              ? `@${comment.creator_username.replace(/^@/, "")}`
                              : "名無し"}
                          </span>
                          <time dateTime={comment.created_at} className="shrink-0">
                            {new Date(comment.created_at).toLocaleString(
                              "ja-JP",
                              { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
                            )}
                          </time>
                        </div>
                        {isEditingComment ? (
                          <CommentEditor
                            commentId={comment.id}
                            content={comment.content}
                            onSave={(content, originalContent) => handleCommentSaved(comment.id, content, originalContent)}
                            onCancel={() => setEditingCommentId(null)}
                          />
                        ) : (
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">
                            {comment.content}
                          </p>
                        )}

                        {/* 指で押し間違えないよう，文字のボタンにして押せる範囲を広く取る */}
                        {canManageComment && !isEditingComment && (
                          <div className="-mb-1 -ml-3 flex">
                            <button
                              type="button"
                              onClick={() => setEditingCommentId(comment.id)}
                              disabled={commentActionsDisabled}
                              className="min-h-11 min-w-11 rounded-lg px-3 text-xs text-sub hover:bg-ink/5 hover:text-ink disabled:opacity-40 sm:min-h-8"
                              aria-label="コメントを編集"
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(comment)}
                              disabled={commentActionsDisabled}
                              className="min-h-11 min-w-11 rounded-lg px-3 text-xs text-sub hover:bg-red-50 hover:text-danger disabled:opacity-40 sm:min-h-8"
                              aria-label="コメントを削除"
                            >
                              削除
                            </button>
                          </div>
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
                  // 入力欄は下に固定して，コメントが増えてもすぐ書けるようにする
                  className="sticky bottom-0 -mx-4 -mb-3 mt-2 flex items-end gap-2 border-t border-line bg-surface px-4 py-2.5"
                >
                  <AutoGrowTextarea
                    aria-label="コメント"
                    placeholder="コメントを書く"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      // 改行は Enter，送信は Ctrl / ⌘ + Enter（変換の確定では送信しない）
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    disabled={submittingComment}
                    maxLength={200}
                    className="field max-h-32 flex-1"
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.trim()}
                    className="btn btn-primary"
                  >
                    送信
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-xs text-faint">
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
