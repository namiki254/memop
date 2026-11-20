import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Loading from "../components/Loading.jsx";
import { loadCreatorUsernames } from "../lib/creatorUsernames.js";

const PAGE_SIZE = 50;
const pageButton = "rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-40";

export default function AdminFolders({ isAdmin, roleChecked, refreshRole }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    // 管理者の確認が済んでから、Supabase に全ユーザーのフォルダを要求する。
    if (!isAdmin) return;
    const controller = new AbortController();
    async function loadFolders() {
      const { data, error } = await supabase.rpc("admin_list_folders", {
        page_offset: page * PAGE_SIZE,
        page_limit: PAGE_SIZE + 1,
      }).abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      const folders = error ? { data, error } : await loadCreatorUsernames(data ?? [], controller.signal);
      if (controller.signal.aborted) return;
      // 閲覧中に権限が解除された場合は、管理メニューの判定も更新する。
      if (folders.error?.code === "42501") refreshRole();
      setResult({ page, ...folders });
    }
    loadFolders();
    return () => controller.abort();
  }, [isAdmin, page, refreshRole]);

  if (!roleChecked) return <Loading />;
  if (!isAdmin) return <ErrorMessage message="管理者権限が必要です。" />;

  const ready = result?.page === page;
  const folders = ready ? result.data?.slice(0, PAGE_SIZE) ?? [] : [];
  const hasNextPage = ready && result.data?.length > PAGE_SIZE;

  return (
    <section className="h-full overflow-y-auto bg-rose-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-xl font-bold text-slate-800">フォルダ管理</h1>
        {!ready ? <Loading /> : result.error ? (
          <ErrorMessage message="フォルダ一覧を取得できませんでした。" />
        ) : folders.length === 0 ? (
          <p className="text-sm text-slate-600">このページにフォルダはありません。</p>
        ) : (
          <ul className="divide-y divide-rose-100 rounded-lg border border-rose-100 bg-white">
            {folders.map((folder) => (
              <li key={folder.id}>
                <Link to={`/folders/${folder.id}`} className="block px-4 py-3 hover:bg-rose-50">
                  <span className="block break-words font-medium text-slate-800">{folder.name}</span>
                  <span className="mt-1 block break-all text-xs text-slate-600">
                    親フォルダ　{folder.parent_name || "ホーム"}
                  </span>
                </Link>
                <p className="break-all px-4 pb-3 text-xs text-slate-500">
                  作成者　{folder.user_id ? (
                    <Link
                      to={`/admin/users?${new URLSearchParams({ user: folder.user_id })}`}
                      className="text-rose-700 underline underline-offset-2"
                      title="ユーザー管理で作成者を開く"
                    >
                      {folder.creator_username ? `@${folder.creator_username}` : folder.user_id}
                    </Link>
                  ) : "持ち主なし"}
                </p>
              </li>
            ))}
          </ul>
        )}
        {(page > 0 || hasNextPage) && (
          <nav aria-label="フォルダ一覧のページ" className="mt-4 flex items-center gap-3">
            <button type="button" className={pageButton} disabled={!ready || page === 0} onClick={() => setPage(page - 1)}>前へ</button>
            <span className="text-sm text-slate-600">{page + 1} ページ</span>
            <button type="button" className={pageButton} disabled={!hasNextPage} onClick={() => setPage(page + 1)}>次へ</button>
          </nav>
        )}
      </div>
    </section>
  );
}
