import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CommentEditor from "../components/CommentEditor.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Loading from "../components/Loading.jsx";
import { supabase } from "../lib/supabase.js";
import { ADMIN_COMMENT_DELETE_UNAVAILABLE_MESSAGE, deleteCommentAsAdmin } from "../lib/pinComments.js";

const PAGE_SIZE = 50;
const pageButton = "rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-40";
const commentDate = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

export default function AdminComments({ isAdmin, roleChecked, refreshRole }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [listVersion, setListVersion] = useState(0);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [feedback, setFeedback] = useState(null);

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
      setResult({ page, listVersion, data, error });
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

  return (
    <section className="h-full overflow-y-auto bg-rose-50">
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
          <ul className="divide-y divide-rose-100 rounded-lg border border-rose-100 bg-white">
            {comments.map((comment) => {
              const author = comment.creator_username?.trim().replace(/^@/, "");
              const postedAt = comment.created_at ? new Date(comment.created_at) : null;
              const target = new URLSearchParams({ pin: comment.pin_id, comment: comment.comment_id });
              const isEditingComment = editingCommentId === comment.comment_id;
              return (
                <li key={comment.comment_id} className="px-4 py-4">
                  <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                    {comment.user_id ? (
                      <Link
                        to={`/admin/users?${new URLSearchParams({ user: comment.user_id })}`}
                        className="break-all font-semibold text-rose-700 underline underline-offset-2"
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
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{comment.content}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <Link
                      to={`/maps/${encodeURIComponent(comment.map_id)}?${target}`}
                      className="min-w-0 break-words font-semibold text-rose-700 underline underline-offset-2"
                    >
                      {comment.map_title || "無題のマップ"} / {comment.pin_title || "無題のピン"}
                    </Link>
                    <span className="text-xs text-slate-600">{comment.is_public ? "公開" : "非公開"}</span>
                    {!isEditingComment && (
                      <div className="ml-auto flex gap-2">
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
                </li>
              );
            })}
          </ul>
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
