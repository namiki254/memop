import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

import { normalizeSearchText } from "../lib/searchText";

import MoveMapModal from "../components/MoveMapModal";

/**
 * マップ一覧ページ．
 *
 * URL: `/`（トップ階層）または `/folders/:folderId`（フォルダの中）
 *
 * フォルダは自分自身を親に持てる（`parent_folder_id`）ので，何階層でも
 * ネストできる．このページは「今いる階層の，子フォルダとマップだけ」を表示する．
 * フォルダに入っていないマップ（`folder_id` が `null`）は，トップ階層に出る．
 */
export default function MapList() {
  const { folderId } = useParams();

  // 今いるフォルダ自身．トップ階層のときは null．
  const [folder, setFolder] = useState(null);
  // 今のフォルダより上の階層．パンくずの表示に使う．
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [childFolders, setChildFolders] = useState([]);
  const [maps, setMaps] = useState([]);
  // 現在ログインしているユーザー
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // 指定されたフォルダIDが存在しない・循環参照している場合
  const [folderNotFound, setFolderNotFound] = useState(false);

  // マップのフォルダ移動に使う状態
  const [allFolders, setAllFolders] = useState([]);
  const [movingMap, setMovingMap] = useState(null);
  const [destinationFolderId, setDestinationFolderId] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");

  // マップ・フォルダを名前で検索する．
  // 通信は増やさず，すでに取得済みの maps / childFolders を絞り込むだけ．
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);

  const visibleMaps = trimmedQuery
    ? maps.filter((map) =>
        normalizeSearchText(map.title).includes(normalizedQuery),
      )
    : maps;
  const visibleFolders = trimmedQuery
    ? childFolders.filter((f) =>
        normalizeSearchText(f.name).includes(normalizedQuery),
      )
    : childFolders;
  const isEmpty = visibleFolders.length === 0 && visibleMaps.length === 0;

// 現在ログインしているユーザーを取得する
  useEffect(() => {
    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUser(user);
    }

    loadCurrentUser();

    // ログイン・ログアウトされたときもcurrentUserを更新する
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setFolderNotFound(false);

      try {
        // 今のフォルダ自身と，そこから親をたどってパンくずを組み立てる．
        // visited は循環参照（親をたどっていくと自分自身に戻ってきてしまう場合）を
        // 検知して無限ループを防ぐためのもの．通常は起こらないが，防御的に入れている．
        let currentFolder = null;
        const crumbs = [];
        let cursor = folderId;
        const visited = new Set();
        let notFound = false;

        while (cursor) {
          if (visited.has(cursor)) {
            notFound = true;
            break;
          }
          visited.add(cursor);

          const { data, error: folderError } = await supabase
            .from("folders")
            .select("*")
            .eq("id", cursor)
            .maybeSingle();

          if (cancelled) return;

          // 22P02 はIDの形式が不正なとき（例: /folders/abc123）．
          // 「見つからなかった」と同じ扱いにする．
          if (folderError && folderError.code !== "22P02") {
            throw folderError;
          }

          if (!data) {
            notFound = true;
            break;
          }


          if (!currentFolder) currentFolder = data;
          crumbs.unshift(data);
          cursor = data.parent_folder_id;
        }

        if (notFound) {
          setFolderNotFound(true);
          return;
        }
        
        // 移動先の選択欄に表示する、すべてのフォルダを取得する
        const { data: foldersForMove, error: foldersForMoveError } =
          await supabase
            .from("folders")
            .select("id, name, parent_folder_id")
            .order("name");

        if (cancelled) return;
        if (foldersForMoveError) throw foldersForMoveError;

        // トップ階層なら parent_folder_id / folder_id が null のものだけ．
        const { data: folders, error: foldersError } = folderId
          ? await supabase
              .from("folders")
              .select("*")
              .eq("parent_folder_id", folderId)
              .order("name")
          : await supabase
              .from("folders")
              .select("*")
              .is("parent_folder_id", null)
              .order("name");

        if (cancelled) return;
        if (foldersError) throw foldersError;

        const { data: mapsData, error: mapsError } = folderId
          ? await supabase
              .from("maps")
              .select("*")
              .eq("folder_id", folderId)
              .order("created_at", { ascending: false })
          : await supabase
              .from("maps")
              .select("*")
              .is("folder_id", null)
              .order("created_at", { ascending: false });

        if (cancelled) return;
        if (mapsError) throw mapsError;

        setFolder(currentFolder);
        setBreadcrumb(crumbs);
        setChildFolders(folders ?? []);
        setAllFolders(foldersForMove ?? []);
        setMaps(mapsData ?? []);
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    // folderIdが変わったら、前の取得結果を無効にする
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  function startCreatingFolder() {
    setFolderError("");
    setIsCreatingFolder(true);
  }

  function cancelCreatingFolder() {
    setNewFolderName("");
    setFolderError("");
    setIsCreatingFolder(false);
  }

  // マップの移動画面を開く
  function startMovingMap(map) {
    // 画面側でも、現在のユーザーが作成者か確認する
    if (!currentUser || currentUser.id !== map.user_id) {
      setMoveError("このマップは移動できません。");
      return;
    }

    setMovingMap(map);
    setDestinationFolderId(map.folder_id ?? "");
    setMoveError("");
  }

  // マップの移動をキャンセルする
  function cancelMovingMap() {
    if (moving) return;

    setMovingMap(null);
    setDestinationFolderId("");
    setMoveError("");
  }

  // 選択したフォルダへマップを移動する
  async function handleMoveMap() {
    if (!movingMap || moving) return;

    const nextFolderId = destinationFolderId || null;

    // 現在と同じ場所が選ばれている場合は更新しない
    if (nextFolderId === movingMap.folder_id) {
      setMoveError("現在と同じ場所が選択されています。");
      return;
    }

    setMoving(true);
    setMoveError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      // 保存直前にも、ログインユーザーが作成者か確認する
      if (userError || !user || user.id !== movingMap.user_id) {
        setMoveError("このマップは移動できません。");
        return;
      }

      const { data: updatedMap, error: updateError } = await supabase
        .from("maps")
        .update({ folder_id: nextFolderId })
        .eq("id", movingMap.id)
        .eq("user_id", user.id)
        .select("id, folder_id")
        .maybeSingle();

      if (updateError) {
        console.error("マップの移動に失敗", updateError);
        setMoveError(`移動に失敗しました。${updateError.message}`);
        return;
      }

      // 更新対象が0件だった場合も失敗として扱う
      if (!updatedMap) {
        setMoveError("マップを移動できませんでした。");
        return;
      }

      // 移動したマップを、現在表示している一覧から取り除く
      setMaps((current) =>
        current.filter((map) => map.id !== movingMap.id),
      );

      setMovingMap(null);
      setDestinationFolderId("");
    } catch (unexpectedError) {
      console.error("マップの移動中に予期しないエラー", unexpectedError);
      setMoveError(
        `予期しないエラーが発生しました。${
          unexpectedError?.message ?? unexpectedError
        }`,
      );
    } finally {
      setMoving(false);
    }
  }

  /** 今のフォルダの中に，新しいフォルダを作る */
  async function handleCreateFolder(event) {
    event.preventDefault();
    if (creatingFolder) return;

    const name = newFolderName.trim();
    if (!name) return;

    setCreatingFolder(true);
    setFolderError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setFolderError("フォルダを作成するにはログインしてください．");
        return;
      }

      const { data: created, error: insertError } = await supabase
        .from("folders")
        .insert({ name, parent_folder_id: folderId ?? null, user_id: user.id })
        .select()
        .single();

      if (insertError) {
        console.error("フォルダの作成に失敗", insertError);
        setFolderError(`作成に失敗しました．${insertError.message}`);
        return;
      }

      setChildFolders((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name, "ja")),
      );
      setNewFolderName("");
      setIsCreatingFolder(false);
    } catch (e) {
      console.error("フォルダの作成中に予期しないエラー", e);
      setFolderError(`予期しないエラーが発生しました．${e?.message ?? e}`);
    } finally {
      setCreatingFolder(false);
    }
  }

  // フォルダを削除する．
  // user_id が null の「持ち主なし」フォルダは誰でも削除できる仕様だが，
  // それでも未ログインの匿名ユーザーには許可しない．
  async function handleDeleteFolder(folder) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const canDelete =
      folder.user_id === null ? Boolean(user) : user?.id === folder.user_id;

    if (!canDelete) {
      setFolderError("このフォルダは削除できません．");
      return;
    }

    if (!window.confirm(`「${folder.name}」を削除しますか？`)) {
      return;
    }

    // RLSに加えて，クライアント側でも所有者条件を絞り込んでおく（多層防御）．
    // ここは削除対象自身の user_id ではなく，今ログインしている人の id で絞る．
    let deleteQuery = supabase.from("folders").delete().eq("id", folder.id);
    deleteQuery =
      folder.user_id === null
        ? deleteQuery.is("user_id", null)
        : deleteQuery.eq("user_id", user.id);

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error("フォルダの削除に失敗", deleteError);
      setFolderError(`削除に失敗しました．${deleteError.message}`);
      return;
    }

    window.location.reload();
  }

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  if (folderNotFound) {
    return (
      <div className="grid h-full place-items-center p-8 text-slate-600">
        <div className="text-center">
          <p className="text-lg font-semibold">フォルダが見つかりません</p>
          <Link to="/" className="mt-3 inline-block text-sm text-rose-500 hover:underline">
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (

    <div className="h-full overflow-auto bg-[#fffaf5] p-6">
      <MoveMapModal
        map={movingMap}
        folders={allFolders}
        destinationFolderId={destinationFolderId}
        onDestinationChange={(folderId) => {
          setDestinationFolderId(folderId);
          setMoveError("");
        }}
        onMove={handleMoveMap}
        onCancel={cancelMovingMap}
        moving={moving}
        error={moveError}
      />
      {/* パンくず．常にホームから始まる． */}
      <p className="text-sm text-slate-500">
        <Link to="/" className="hover:underline">
          ホーム
        </Link>
        {breadcrumb.map((f) => (
          <span key={f.id}>
            {" / "}
            <Link to={`/folders/${f.id}`} className="hover:underline">
              {f.name}
            </Link>
          </span>
        ))}
      </p>

      <div className="mt-1 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">
          {folder ? folder.name : "マップ一覧"}
        </h2>
        <button
          type="button"
          onClick={startCreatingFolder}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          ＋ 新しいフォルダ
        </button>
      </div>

      {isCreatingFolder && (
        <form onSubmit={handleCreateFolder} className="mt-3 flex max-w-sm gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.nativeEvent.isComposing) {
                e.preventDefault();
              }
            }}
            disabled={creatingFolder}
            maxLength={100}
            placeholder="フォルダ名（例：豊洲）"
            className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={creatingFolder || newFolderName.trim() === ""}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            作成
          </button>
          <button
            type="button"
            onClick={cancelCreatingFolder}
            disabled={creatingFolder}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            キャンセル
          </button>
        </form>
      )}

      {folderError && (
        <p className="mt-2 max-w-sm rounded bg-red-50 p-2 text-sm text-red-700">
          {folderError}
        </p>
      )}

      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="マップ・フォルダを名前で検索"
        className="
          mt-4 w-full max-w-sm
          rounded-full
          border border-rose-100
          bg-white
          px-4 py-2.5
          text-sm
          shadow-sm
          outline-none
          transition
          focus:border-rose-300
          focus:ring-4
          focus:ring-rose-100
        "
      />

      {isEmpty ? (
        <p className="mt-6 text-slate-500">
          {trimmedQuery
            ? `「${trimmedQuery}」に一致するものが見つかりません．`
            : "ここには何もありません．"}
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFolders.map((f) => (
            <div
              key={f.id}
              className="
                flex items-center gap-3
                rounded-2xl
                border border-amber-100
                bg-amber-50
                p-4
                shadow-sm
                transition
                hover:-translate-y-0.5
                hover:shadow-md
              "
            >
              {/* フォルダ名をクリックするとフォルダを開く */}
              <Link
                to={`/folders/${f.id}`}
                className="flex flex-1 items-center gap-3 hover:opacity-70"
              >
                <span className="text-2xl">📁</span>

                <div>
                  <p className="font-bold text-[#3f3a3a]">{f.name}</p>
                  <p className="mt-0.5 text-xs text-amber-700/60">
                    フォルダ
                  </p>
                </div>
              </Link>

              {/* 作成者だけ削除ボタンを表示する（持ち主なしフォルダはログイン済みなら誰でも） */}
              {(f.user_id === null
                ? Boolean(currentUser)
                : currentUser?.id === f.user_id) && (
                <button
                  type="button"
                  onClick={() => handleDeleteFolder(f)}
                  className="text-xs text-red-600 hover:underline"
                >
                  削除
                </button>
              )}
            </div>
          ))}

          {visibleMaps.map((map) => (
            <div
              key={map.id}
              className="group overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <Link
                to={`/maps/${map.id}`}
                className="block"
              >
                {map.image_url ? (
                  <div className="overflow-hidden bg-rose-100">
                    <img
                      src={map.image_url}
                      alt={map.title}
                      className="h-40 w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                ) : (
                  // bg-rose-50 だとほぼ白に見えてしまうため，rose-100 に変更．
                  <div className="grid h-40 w-full place-items-center bg-rose-100 text-3xl">
                    🗺️
                  </div>
                )}

                <div className="p-4">
                  <h3 className="font-bold text-[#3f3a3a]">
                    {map.title}
                  </h3>

                  {map.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-[#817878]">
                      {map.description}
                    </p>
                  )}
                </div>
              </Link>

              {/* マップ作成者にだけ移動ボタンを表示する */}
              {currentUser?.id === map.user_id && (
                <div className="border-t border-rose-100 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => startMovingMap(map)}
                    className="text-sm font-medium text-rose-600 hover:underline"
                  >
                    移動
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
