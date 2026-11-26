import { getMapVisibilityLabel } from "../lib/mapVisibility.js";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Loading from "../components/Loading.jsx";
import { loadCreatorUsernames } from "../lib/creatorUsernames.js";

const PAGE_SIZE = 50;

export default function AdminMaps({ isAdmin, roleChecked }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;

    const controller = new AbortController();
    async function loadMaps() {
      const start = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from("maps")
        // 作成者IDをユーザー管理へのリンクに使う。
        .select("id, title, is_public, visibility, user_id")
        .order("created_at", { ascending: false })
        .order("id")
        .range(start, start + PAGE_SIZE)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      const maps = error ? { data, error } : await loadCreatorUsernames(data ?? [], controller.signal);
      if (!controller.signal.aborted) setResult({ page, ...maps });
    }

    loadMaps();
    return () => controller.abort();
  }, [isAdmin, page]);

  if (!roleChecked) return <Loading />;
  if (!isAdmin) return <ErrorMessage message="管理者権限が必要です。" />;

  const maps = result?.data?.slice(0, PAGE_SIZE) ?? [];
  const pageButton = "btn btn-sm";

  return (
    <section className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-xl font-bold text-slate-800">マップ管理</h1>
        {result?.page !== page ? (
          <Loading />
        ) : result.error ? (
          <ErrorMessage message="マップ一覧を取得できませんでした。" />
        ) : maps.length === 0 ? (
          <p className="text-sm text-slate-600">このページにマップはありません。</p>
        ) : (
          <ul className="space-y-2">
            {maps.map((map) => (
              // マップ1件ごとに白い枠で区切り，枠のどこを押してもそのマップを開けるようにする．
              // 仕組み：マップへのリンクに付けた透明な面（after:）を，枠いっぱいに広げて重ねている．
              // 作成者のリンクだけは relative z-10 でその面より手前に出して，別々に押せるようにしている
              // （リンクの中にリンクを入れることはできないため，この形にしている）．
              <li
                key={map.id}
                className="relative rounded-lg border border-line bg-surface transition-colors hover:border-line-strong hover:bg-paper"
              >
                <Link
                  to={`/maps/${map.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 after:absolute after:inset-0 after:rounded-lg"
                >
                  <span className="min-w-0 break-words font-medium text-slate-800">{map.title}</span>
                  <span className="shrink-0 text-xs text-slate-600">{getMapVisibilityLabel(map)}</span>
                </Link>
                <p className="break-all px-4 pb-3 text-xs text-slate-500">
                  作成者　{map.user_id ? (
                    <Link
                      to={`/admin/users?${new URLSearchParams({ user: map.user_id })}`}
                      className="relative z-10 text-accent-strong underline underline-offset-2"
                      title="ユーザー管理で作成者を開く"
                    >
                      {map.creator_username ? `@${map.creator_username}` : map.user_id}
                    </Link>
                  ) : "作成者不明"}
                </p>
              </li>
            ))}
          </ul>
        )}
        {(page > 0 || result?.data?.length > PAGE_SIZE) && (
          <nav aria-label="マップ一覧のページ" className="mt-4 flex items-center gap-3">
            <button type="button" className={pageButton} disabled={page === 0} onClick={() => setPage(page - 1)}>
              前へ
            </button>
            <span className="text-sm text-slate-600">{page + 1} ページ</span>
            <button
              type="button"
              className={pageButton}
              disabled={result?.page !== page || !(result.data?.length > PAGE_SIZE)}
              onClick={() => setPage(page + 1)}
            >
              次へ
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
