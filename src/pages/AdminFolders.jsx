import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Loading from "../components/Loading.jsx";
import { loadCreatorUsernames } from "../lib/creatorUsernames.js";
import Icon from "../components/Icon.jsx";

const PAGE_SIZE = 50;
const pageButton = "btn btn-sm";

// 親をたどる回数の上限．データの不具合で親が循環していても，問い合わせが止まらなくなるのを防ぐ
const MAX_FOLDER_DEPTH = 20;

/**
 * 各フォルダに「ホームからの道すじ」（祖先フォルダの名前を上から順に並べた配列）を path として付ける．
 *
 * 一覧を返す関数（admin_list_folders）は1つ上の親の名前までしか返さないので，
 * それより上の祖先は folders テーブルから階層ごとにまとめて取得する（深さの分だけ問い合わせる）．
 * 途中の祖先を取得できなかったときは，分かっている所までを出し，先頭に pathIncomplete を立てる．
 */
async function addFolderPaths(folders, signal) {
  const known = new Map(folders.map((folder) => [folder.id, { name: folder.name, parentId: folder.parent_folder_id }]));
  // 1つ上の親は一覧の結果に名前が入っているので，問い合わせずに使う
  for (const folder of folders) {
    if (folder.parent_folder_id && !known.has(folder.parent_folder_id) && folder.parent_name) {
      known.set(folder.parent_folder_id, { name: folder.parent_name, parentId: undefined });
    }
  }

  for (let depth = 0; depth < MAX_FOLDER_DEPTH; depth++) {
    // まだ親が分からないフォルダ（parentId が undefined）と，まだ名前を知らない祖先を集める
    const missing = [...known.entries()]
      .filter(([, folder]) => folder.parentId === undefined)
      .map(([folderId]) => folderId);
    for (const folder of known.values()) {
      if (folder.parentId && !known.has(folder.parentId)) missing.push(folder.parentId);
    }
    const ids = [...new Set(missing)];
    if (ids.length === 0) break;

    const { data, error } = await supabase.from("folders")
      .select("id, name, parent_folder_id").in("id", ids).abortSignal(signal);
    if (signal.aborted || error) break;

    for (const row of data ?? []) known.set(row.id, { name: row.name, parentId: row.parent_folder_id });
    // 取得できなかったもの（削除済み・見られない）は，それ以上たどらない
    for (const folderId of ids) {
      const folder = known.get(folderId);
      if (!folder) known.set(folderId, { name: null, parentId: null });
      else if (folder.parentId === undefined) folder.parentId = null;
    }
  }

  return folders.map((folder) => {
    const path = [];
    const visited = new Set([folder.id]);
    let pathIncomplete = false;
    let cursor = folder.parent_folder_id;
    while (cursor) {
      const ancestor = known.get(cursor);
      if (!ancestor?.name || visited.has(cursor)) {
        pathIncomplete = true;
        break;
      }
      visited.add(cursor);
      path.unshift(ancestor.name);
      if (ancestor.parentId === undefined) {
        pathIncomplete = true;
        break;
      }
      cursor = ancestor.parentId;
    }
    return { ...folder, path, pathIncomplete };
  });
}

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
      const named = error ? { data, error } : await loadCreatorUsernames(data ?? [], controller.signal);
      if (controller.signal.aborted) return;
      // 作成者の名前が取れたら，ホームからの道すじも付ける
      const folders = named.error ? named : { ...named, data: await addFolderPaths(named.data, controller.signal) };
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
    <section className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 text-xl font-bold text-slate-800">フォルダ管理</h1>
        {!ready ? <Loading /> : result.error ? (
          <ErrorMessage message="フォルダ一覧を取得できませんでした。" />
        ) : folders.length === 0 ? (
          <p className="text-sm text-slate-600">このページにフォルダはありません。</p>
        ) : (
          <ul className="space-y-2">
            {folders.map((folder) => (
              // マップ管理（AdminMaps.jsx）と同じ作り．1件ごとに白い枠で区切り，枠のどこを押してもフォルダを開ける．
              // フォルダへのリンクに付けた透明な面（after:）を枠いっぱいに広げ，
              // 作成者のリンクだけ relative z-10 で手前に出して別々に押せるようにしている．
              <li
                key={folder.id}
                className="relative rounded-lg border border-line bg-surface transition-colors hover:border-line-strong hover:bg-paper"
              >
                <Link to={`/folders/${folder.id}`} className="block px-4 py-3 after:absolute after:inset-0 after:rounded-lg">
                  <span className="block break-words font-medium text-slate-800">{folder.name}</span>
                  {/*
                    このフォルダがある場所を，ホームからのパンくず（ホーム › 親 › …）で出す．
                    カード全体が1つのリンクなので，パンくずの各項目はリンクにしない．
                  */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-slate-600">
                    <span className="sr-only">場所：</span>
                    {["ホーム", ...(folder.pathIncomplete ? ["…"] : []), ...folder.path].map((name, index) => (
                      <span key={index} className="flex min-w-0 items-center gap-x-1">
                        {index > 0 && <Icon name="chevronRight" className="size-3.5 text-faint" />}
                        <span className="break-all">{name}</span>
                      </span>
                    ))}
                  </span>
                </Link>
                <p className="break-all px-4 pb-3 text-xs text-slate-500">
                  作成者　{folder.user_id ? (
                    <Link
                      to={`/admin/users?${new URLSearchParams({ user: folder.user_id })}`}
                      className="relative z-10 text-accent-strong underline underline-offset-2"
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
