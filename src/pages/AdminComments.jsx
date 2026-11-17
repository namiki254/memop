import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Loading from "../components/Loading.jsx";
import { supabase } from "../lib/supabase.js";

const PAGE_SIZE = 50;
const pageButton = "rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-40";
const commentDate = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

export default function AdminComments({ isAdmin, roleChecked, refreshRole }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);

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
      setResult({ page, data, error });
    }

    loadComments();
    return () => controller.abort();
  }, [isAdmin, page, refreshRole]);

  if (!roleChecked) return <Loading />;
  if (!isAdmin) return <ErrorMessage message="管理者権限が必要です。" />;

  const pageReady = result?.page === page;
  const comments = pageReady ? result.data?.slice(0, PAGE_SIZE) ?? [] : [];
  const hasNextPage = pageReady && result.data?.length > PAGE_SIZE;

  return (
    <section className="h-full overflow-y-auto bg-rose-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-xl font-bold text-slate-800">コメント管理</h1>
        {!pageReady ? (
          <Loading />
        ) : result.error?.code === "PGRST202" ? (
          <ErrorMessage message="接続先の Supabase でコメント管理用の関数が見つかりません。docs/sql/issue-13-admin-comments.sql を SQL Editor で実行してから再読み込みしてください。" />
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
              return (
                <li key={comment.comment_id} className="px-4 py-4">
                  <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                    <span className="break-all font-semibold">
                      {author ? `@${author}` : comment.user_id || "投稿者不明"}
                    </span>
                    {postedAt && <time dateTime={comment.created_at}>{commentDate.format(postedAt)}</time>}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{comment.content}</p>
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <Link
                      to={`/maps/${encodeURIComponent(comment.map_id)}?${target}`}
                      className="min-w-0 break-words font-semibold text-rose-700 underline underline-offset-2"
                    >
                      {comment.map_title || "無題のマップ"} / {comment.pin_title || "無題のピン"}
                    </Link>
                    <span className="text-xs text-slate-600">{comment.is_public ? "公開" : "非公開"}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {(page > 0 || hasNextPage) && (
          <nav aria-label="コメント一覧のページ" className="mt-4 flex items-center gap-3">
            <button type="button" className={pageButton} disabled={page === 0} onClick={() => setPage(page - 1)}>
              前へ
            </button>
            <span className="text-sm text-slate-600">{page + 1} ページ</span>
            <button type="button" className={pageButton} disabled={!hasNextPage} onClick={() => setPage(page + 1)}>
              次へ
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
