import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Loading from "../components/Loading.jsx";

const PAGE_SIZE = 50;
const buttonClass = "rounded-md border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40";

export default function AdminUsers({ currentUserId, linkedUserId, isAdmin, roleChecked, refreshRole }) {
  // 各管理画面のユーザーリンクから来たときは、該当ページを Supabase に問い合わせる。
  const [page, setPage] = useState(linkedUserId ? null : 0);
  const [listVersion, setListVersion] = useState(0);
  const [result, setResult] = useState(null);
  const [savingUserId, setSavingUserId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const linkedUserRef = useRef(null);

  useEffect(() => {
    // URL を直接開いても、管理者だと確認できるまで一覧を要求しない。
    // 一覧を返してよいかの最終判断は Supabase 側でも行う。
    if (!isAdmin) return;

    const controller = new AbortController();
    async function loadUsers() {
      const linkedPage = page === null
        ? await supabase.rpc("admin_list_users_at_user", {
          target_user_id: linkedUserId,
          page_size: PAGE_SIZE,
        }).abortSignal(controller.signal)
        : null;
      if (controller.signal.aborted) return;

      let pageNumber = page ?? 0;
      let linkMessage = "";
      if (linkedPage?.data?.length) {
        const { data } = linkedPage;
        pageNumber = data[0].page_number;
        setResult({ page, pageNumber, listVersion, data, error: null });
        return;
      }

      if (linkedPage?.error?.code === "42501") {
        refreshRole();
        setResult({ page, pageNumber, listVersion, error: linkedPage.error });
        return;
      }

      // 対象を探せない場合も、通常のユーザー一覧を開けるようにする。
      if (linkedPage?.error && linkedPage.error.code !== "22P02") {
        linkMessage = "ユーザーのリンクを開けませんでした。下のユーザー一覧から探してください。";
      } else if (linkedPage) {
        linkMessage = "指定されたユーザーが一覧に見つかりませんでした。";
      }

      // 表示件数より1件多く取得し、次のページがあるかを確認する。
      const { data, error } = await supabase
        .rpc("admin_list_users", {
          page_offset: pageNumber * PAGE_SIZE,
          page_limit: PAGE_SIZE + 1,
        })
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (error?.code === "42501") refreshRole();
      setResult({ page, pageNumber, listVersion, data, error, linkMessage });
    }

    loadUsers();
    // ページ移動やログアウトで不要になった一覧の取得を取り消す。
    return () => controller.abort();
  }, [isAdmin, linkedUserId, page, listVersion, refreshRole]);

  function reloadUsers() {
    setListVersion((version) => version + 1);
  }

  async function changeAdminRole(user) {
    const makeAdmin = !user.is_admin;
    const action = makeAdmin ? "付与" : "解除";
    const account = user.email || user.user_id;
    if (!window.confirm(`${account} の管理者権限を${action}しますか？`)) return;

    setFeedback(null);
    setSavingUserId(user.user_id);
    // 変更先と変更後の状態を指定する。操作した人は Supabase がログイン情報から確認する。
    const { error } = await supabase.rpc("admin_set_map_admin", {
      target_user_id: user.user_id,
      make_admin: makeAdmin,
    });

    if (error?.code === "23514" && error.message === "last_map_admin") {
      setFeedback({ error: "最後の管理者の権限は解除できません。" });
    } else if (error) {
      setFeedback({ error: "権限変更の結果を確認できませんでした。最新の一覧を確認してください。" });
    } else {
      setFeedback({ message: `${account} の管理者権限を${action}しました。` });
    }

    // 通信エラーでも保存済みの場合があるので、一覧は Supabase から読み直す。
    reloadUsers();
    if (user.user_id === currentUserId || error?.code === "42501") refreshRole();
    setSavingUserId(null);
  }

  const loading = result?.page !== page || result?.listVersion !== listVersion;
  const pageNumber = page ?? result?.pageNumber ?? 0;
  const users = loading ? [] : result.data?.slice(0, PAGE_SIZE) ?? [];
  const hasNextPage = !loading && result.data?.length > PAGE_SIZE;
  const hasLinkedUser = Boolean(linkedUserId && users.some((user) => user.user_id === linkedUserId));
  const saving = savingUserId !== null;

  useEffect(() => {
    // ページを開いたら、画面の下の方にある行でも見つけやすくする。
    if (!hasLinkedUser) return;
    linkedUserRef.current?.scrollIntoView({ block: "nearest" });
    linkedUserRef.current?.focus({ preventScroll: true });
  }, [hasLinkedUser]);

  if (!roleChecked) return <Loading />;
  if (!isAdmin) return <ErrorMessage message="管理者権限が必要です。" />;

  return (
    <section className="h-full overflow-y-auto bg-rose-50">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-xl font-bold text-slate-800">ユーザー管理</h1>
        {!loading && result.linkMessage && (
          <p role="status" className="mb-4 text-sm text-slate-600">{result.linkMessage}</p>
        )}
        {feedback?.error && <ErrorMessage message={feedback.error} />}
        {feedback?.message && (
          <p role="status" className="mb-4 rounded-md bg-white px-4 py-3 text-sm text-slate-700">
            {feedback.message}
          </p>
        )}
        {loading ? (
          <Loading />
        ) : result.error ? (
          <>
            <ErrorMessage message="ユーザー一覧を取得できませんでした。" />
            <button type="button" className={buttonClass} onClick={reloadUsers}>再読み込み</button>
          </>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-600">このページにユーザーはいません。</p>
        ) : (
          <ul className="divide-y divide-rose-100 rounded-lg border border-rose-100 bg-white">
            {users.map((user) => {
              const actionLabel = user.is_admin ? "管理者を解除" : "管理者にする";
              const isLinkedUser = user.user_id === linkedUserId;
              return (
                <li
                  key={user.user_id}
                  ref={isLinkedUser ? linkedUserRef : null}
                  tabIndex={isLinkedUser ? -1 : undefined}
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${isLinkedUser ? "bg-rose-50 ring-2 ring-inset ring-rose-400" : ""}`}
                >
                  <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                    <p className="break-all font-medium text-slate-800">
                      {user.github_username || "GitHub ユーザー名なし"}
                      {user.user_id === currentUserId && <span className="ml-2 text-xs text-slate-500">自分</span>}
                      {isLinkedUser && <span className="ml-2 text-xs text-rose-700">選択中のユーザー</span>}
                    </p>
                    <p className="break-all text-sm text-slate-600">{user.email || "メールアドレス未登録"}</p>
                    <p className="break-all text-xs text-slate-500">{user.user_id}</p>
                  </div>
                  <span className="text-sm text-slate-600">{user.is_admin ? "管理者" : "一般ユーザー"}</span>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`${user.email || user.user_id} を${user.is_admin ? "一般ユーザーにする" : "管理者にする"}`}
                    disabled={saving}
                    onClick={() => changeAdminRole(user)}
                  >
                    {savingUserId === user.user_id ? "保存中…" : actionLabel}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {(pageNumber > 0 || hasNextPage) && (
          <nav aria-label="ユーザー一覧のページ" className="mt-4 flex items-center gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={loading || pageNumber === 0 || saving}
              onClick={() => setPage(pageNumber - 1)}
            >
              前へ
            </button>
            <span className="text-sm text-slate-600">{pageNumber + 1} ページ</span>
            <button
              type="button"
              className={buttonClass}
              disabled={loading || !hasNextPage || saving}
              onClick={() => setPage(pageNumber + 1)}
            >
              次へ
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
