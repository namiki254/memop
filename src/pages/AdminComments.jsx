import { getMapVisibilityLabel } from "../lib/mapVisibility.js";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CommentEditor from "../components/CommentEditor.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Icon from "../components/Icon.jsx";
import Loading from "../components/Loading.jsx";
import { supabase } from "../lib/supabase.js";
import { ADMIN_COMMENT_DELETE_UNAVAILABLE_MESSAGE, deleteCommentAsAdmin } from "../lib/pinComments.js";
import { getPinEmoji } from "../lib/pinTypes.js";

const PAGE_SIZE = 50;
const pageButton = "btn btn-sm";
// 「すべて」のタブを表す値．マップの id と重ならない文字列にしている
const ALL_MAPS = "__all__";
const commentDate = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

/**
 * コメント先のピンが地図の上で使っているアイコン（絵文字）を調べて，各コメントに pin_icon として付ける．
 *
 * コメント一覧を返す関数（admin_list_pin_comments）はピンの種類を返さないので，
 * 一覧に出てくるピンの分だけ，pins テーブルからまとめて1回で取得する．
 * 取得できなかったときは一覧を止めず，アイコンなし（共通のピンの印）で表示する．
 */
async function addPinIcons(comments, signal) {
  const pinIds = [...new Set(comments.map((comment) => comment.pin_id).filter(Boolean))];
  if (pinIds.length === 0) return comments;

  const { data: pins, error } = await supabase
    .from("pins")
    .select("id, pin_type, kind")
    .in("id", pinIds)
    .abortSignal(signal);

  if (error || !pins) {
    if (!signal.aborted) console.error("ピンのアイコンを取得できませんでした", error);
    return comments;
  }

  const pinById = new Map(pins.map((pin) => [String(pin.id), pin]));
  return comments.map((comment) => {
    const pin = pinById.get(String(comment.pin_id));
    if (!pin) return comment;
    // 地図の上と同じ見分け方．マップ移動のボタンは扉，それ以外は種類ごとの絵文字（MapView.jsx と同じ）
    return { ...comment, pin_icon: pin.kind === "button" ? "🚪" : getPinEmoji(pin.pin_type) };
  });
}

export default function AdminComments({ isAdmin, roleChecked, refreshRole }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [listVersion, setListVersion] = useState(0);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  // どのマップのコメントを表示しているか．ALL_MAPS は「すべて」のタブ
  const [selectedMapId, setSelectedMapId] = useState(ALL_MAPS);

  useEffect(() => {
    // URLを直接開いても、管理者だと確認するまでは一覧を要求しない。
    if (!isAdmin) return;

    const controller = new AbortController();
    async function loadComments() {
      // 1件多く取得し、次のページがあるかを確認する。
      const { data, error } = await supabase.rpc("admin_list_pin_comments", {
        page_offset: page * PAGE_SIZE,
        page_limit: PAGE_SIZE + 1,
      }).abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      // 一覧を開いている間に管理者権限が解除された場合、管理メニューも更新する。
      if (error?.code === "42501") refreshRole();
      // 最終ページの最後のコメントを削除したら、前のページを読み込む。
      if (!error && data?.length === 0 && page > 0) {
        setPage(page - 1);
        return;
      }
      // 一覧が取れたら，コメント先のピンのアイコンも付ける
      const rows = error || !data ? data : await addPinIcons(data, controller.signal);
      if (controller.signal.aborted) return;
      setResult({ page, listVersion, data: rows, error });
    }

    loadComments();
    return () => controller.abort();
  }, [isAdmin, page, listVersion, refreshRole]);

  async function deleteComment(comment) {
    if (!isAdmin || deletingCommentId !== null) return;
    const pinTitle = comment.pin_title || "無題のピン";
    if (!window.confirm(`「${pinTitle}」のこのコメントを削除しますか？`)) return;

    setDeletingCommentId(comment.comment_id);
    setFeedback(null);
    // 管理者かどうかは Supabase でも確認する。画面から渡すのは削除対象のIDだけ。
    const { data: deleted, error } = await deleteCommentAsAdmin(comment.comment_id);

    if (error?.code === "PGRST202") {
      setFeedback({ error: ADMIN_COMMENT_DELETE_UNAVAILABLE_MESSAGE });
    } else if (error) {
      if (error.code === "42501") refreshRole();
      setFeedback({ error: "コメントの削除結果を確認できませんでした。最新の一覧を確認してください。" });
    } else {
      setFeedback({ message: deleted ? "コメントを削除しました。" : "このコメントはすでに削除されています。" });
    }

    // 通信が途中で切れても、再取得した一覧で実際の削除結果を確認できるようにする。
    setListVersion((version) => version + 1);
    setDeletingCommentId(null);
  }

  function handleCommentSaved(commentId, content) {
    // SQL が返した本文を使い、一覧の並び順と投稿者の表示を保つ。
    setResult((previous) => ({
      ...previous,
      data: previous.data.map((comment) => comment.comment_id === commentId ? { ...comment, content } : comment),
    }));
    setEditingCommentId(null);
    setFeedback({ message: "コメントを保存しました。" });
  }

  if (!roleChecked) return <Loading />;
  if (!isAdmin) return <ErrorMessage message="管理者権限が必要です。" />;

  const pageReady = result?.page === page && result.listVersion === listVersion;
  const comments = pageReady ? result.data?.slice(0, PAGE_SIZE) ?? [] : [];
  const hasNextPage = pageReady && result.data?.length > PAGE_SIZE;
  const commentActionsDisabled = deletingCommentId !== null || editingCommentId !== null;

  // コメントをマップごとにまとめる．並びは「新しいコメントがあるマップ」が先（取得した順のまま）．
  // まとめているのは，このページに取得した分（50件）だけ．
  const mapGroups = [];
  const groupByMapId = new Map();
  for (const comment of comments) {
    let group = groupByMapId.get(comment.map_id);
    if (!group) {
      group = {
        mapId: comment.map_id,
        title: comment.map_title || "無題のマップ",
        visibilityLabel: getMapVisibilityLabel(comment),
        comments: [],
      };
      groupByMapId.set(comment.map_id, group);
      mapGroups.push(group);
    }
    group.comments.push(comment);
  }

  // 選んでいたマップのコメントが無くなった（削除した・ページを移った）ときは「すべて」に戻す
  const activeMapId = groupByMapId.has(selectedMapId) ? selectedMapId : ALL_MAPS;
  const visibleGroups = activeMapId === ALL_MAPS ? mapGroups : [groupByMapId.get(activeMapId)];
  const tabs = [
    { id: ALL_MAPS, label: "すべて", count: comments.length },
    ...mapGroups.map((group) => ({ id: group.mapId, label: group.title, count: group.comments.length })),
  ];
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeMapId);

  // タブの上では，左右の矢印キーで隣のタブへ移れるようにする
  function handleTabKeyDown(event) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    if (editingCommentId !== null) return;

    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (activeTabIndex + step + tabs.length) % tabs.length;
    setSelectedMapId(tabs[nextIndex].id);
    // 選択が画面に反映されてから，新しく選ばれたタブにフォーカスを移す
    requestAnimationFrame(() => document.getElementById(`admin-comments-tab-${nextIndex}`)?.focus());
  }

  // コメント1件分の表示
  function renderComment(comment) {
    const author = comment.creator_username?.trim().replace(/^@/, "");
    const postedAt = comment.created_at ? new Date(comment.created_at) : null;
    const target = new URLSearchParams({ pin: comment.pin_id, comment: comment.comment_id });
    const isEditingComment = editingCommentId === comment.comment_id;
    return (
      // マップ管理（AdminMaps.jsx）と同じ作り．1件ごとに白い枠で区切り，
      // 枠のどこを押しても，そのコメントが付いているピンを開ける（上のピン名のリンクを枠いっぱいに広げている）．
      // マップ名と公開範囲は，マップごとの見出しに出しているので，ここには書かない．
      // 投稿者のリンクと編集・削除のボタンは relative z-10 で手前に出して，別々に押せるようにしている．
      // 本文を編集している間は，入力中に誤って画面が移らないよう，枠全体のリンクを外す．
      <li
        key={comment.comment_id}
        className={`relative rounded-lg border border-line bg-surface px-4 py-2.5 transition-colors ${isEditingComment ? "" : "hover:border-line-strong hover:bg-paper"}`}
      >
        {/*
          いちばん上に「どの場所（ピン）へのコメントか」を小さく出す．主役は下のコメント本文なので，ここは控えめにしている．
          アイコンは，そのピンが地図の上で使っている絵文字（取得できなかったときは共通のピンの印）．
          このリンクが枠全体に広がっていて，押すとそのピンを開く．
        */}
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-sub">
          {comment.pin_icon ? (
            <span aria-hidden="true" className="shrink-0 whitespace-nowrap text-sm">{comment.pin_icon}</span>
          ) : (
            <Icon name="pin" />
          )}
          <Link
            to={`/maps/${encodeURIComponent(comment.map_id)}?${target}`}
            className={`min-w-0 truncate font-bold ${isEditingComment ? "" : "after:absolute after:inset-0 after:rounded-lg"}`}
          >
            <span className="sr-only">コメント先のピン：</span>
            {comment.pin_title || "無題のピン"}
          </Link>
        </div>

        {/*
          コメント本文と，編集・削除のボタン．
          広い画面では横に並べて（ボタンは右下），ボタンだけの行を作らないことで縦を詰めている．
          スマホは幅が足りないので，これまでどおり本文の下にボタンを置く．
        */}
        <div className="mt-1.5 sm:flex sm:items-end sm:gap-3">
          {/* その場所に付いたコメント．左の線で，上のピンに対する書き込みだと分かるようにする． */}
          <div className="min-w-0 flex-1 border-l-2 border-line pl-3">
            <p className="mb-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sub">
              {comment.user_id ? (
                <Link
                  to={`/admin/users?${new URLSearchParams({ user: comment.user_id })}`}
                  className="relative z-10 break-all font-semibold text-accent-strong underline underline-offset-2"
                  title="ユーザー管理で投稿者を開く"
                >
                  {author ? `@${author}` : comment.user_id}
                </Link>
              ) : (
                <span className="break-all font-semibold">{author ? `@${author}` : "投稿者不明"}</span>
              )}
              {postedAt && <time dateTime={comment.created_at}>{commentDate.format(postedAt)}</time>}
            </p>
            {isEditingComment ? (
              <CommentEditor
                commentId={comment.comment_id}
                content={comment.content}
                onSave={(content) => handleCommentSaved(comment.comment_id, content)}
                onCancel={() => setEditingCommentId(null)}
              />
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm text-ink">{comment.content}</p>
            )}
          </div>

          <div className="mt-1.5 flex shrink-0 justify-end empty:hidden sm:mt-0">
            {!isEditingComment && (
              <div className="relative z-10 flex gap-2">
                <button
                  type="button"
                  className={pageButton}
                  disabled={commentActionsDisabled}
                  aria-label={`${comment.pin_title || "ピン"}のコメントを編集`}
                  onClick={() => {
                    setFeedback(null);
                    setEditingCommentId(comment.comment_id);
                  }}
                >
                  編集
                </button>
                <button
                  type="button"
                  className={pageButton}
                  disabled={commentActionsDisabled}
                  aria-label={`${comment.pin_title || "ピン"}のコメントを削除`}
                  onClick={() => deleteComment(comment)}
                >
                  {deletingCommentId === comment.comment_id ? "削除中…" : "削除"}
                </button>
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  return (
    <section className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-xl font-bold text-slate-800">コメント管理</h1>
        {feedback?.error && <ErrorMessage message={feedback.error} />}
        {feedback?.message && (
          <p role="status" className="mb-4 rounded-md bg-white px-4 py-3 text-sm text-slate-700">
            {feedback.message}
          </p>
        )}
        {!pageReady ? (
          <Loading />
        ) : result.error?.code === "PGRST202" ? (
          <ErrorMessage message="コメント管理は現在利用できません。運営担当者にお問い合わせください。" />
        ) : result.error ? (
          <ErrorMessage message={result.error.code
            ? `コメント一覧を取得できませんでした。（エラーコード: ${result.error.code}）`
            : "コメント一覧を取得できませんでした。"} />
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-600">このページにコメントはありません。</p>
        ) : (
          <>
            {/*
              マップごとのタブ．「すべて」では全マップ分を，マップ名のタブではそのマップのコメントだけを出す．
              マップが多いと横に長くなるので，はみ出した分は横スクロールで見せる．
              本文の編集中は，書きかけの内容が消えないよう切り替えられないようにしている．
            */}
            <div
              role="tablist"
              aria-label="マップごとに表示"
              onKeyDown={handleTabKeyDown}
              className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1"
            >
              {tabs.map((tab, index) => {
                const selected = tab.id === activeMapId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`admin-comments-tab-${index}`}
                    aria-selected={selected}
                    aria-controls="admin-comments-panel"
                    // 矢印キーでタブの間を移動できるよう，Tab キーで止まるのは選択中のタブだけにする
                    tabIndex={selected ? 0 : -1}
                    disabled={editingCommentId !== null && !selected}
                    onClick={() => setSelectedMapId(tab.id)}
                    className={`flex min-h-10 max-w-56 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 ${selected
                      ? "border-ink bg-ink font-bold text-white"
                      : "border-line-strong bg-surface text-sub hover:text-ink"
                      }`}
                  >
                    <span className="min-w-0 truncate">{tab.label}</span>
                    <span className={`text-xs font-normal ${selected ? "text-white/80" : "text-faint"}`}>{tab.count}</span>
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              id="admin-comments-panel"
              aria-labelledby={`admin-comments-tab-${activeTabIndex}`}
              className="space-y-6"
            >
              {visibleGroups.map((group) => (
                <section key={group.mapId} aria-label={group.title}>
                  <h2 className="mb-2 flex min-w-0 items-center gap-2 text-sm font-bold text-sub">
                    <Icon name="map" />
                    <span className="min-w-0 truncate">{group.title}</span>
                    <span className="tag">{group.visibilityLabel}</span>
                    <span className="shrink-0 font-normal">{group.comments.length}件</span>
                  </h2>
                  <ul className="space-y-1.5">
                    {group.comments.map(renderComment)}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
        {(page > 0 || hasNextPage) && (
          <nav aria-label="コメント一覧のページ" className="mt-4 flex items-center gap-3">
            <button type="button" className={pageButton} disabled={!pageReady || page === 0 || commentActionsDisabled} onClick={() => setPage(page - 1)}>
              前へ
            </button>
            <span className="text-sm text-slate-600">{page + 1} ページ</span>
            <button type="button" className={pageButton} disabled={!hasNextPage || commentActionsDisabled} onClick={() => setPage(page + 1)}>
              次へ
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
