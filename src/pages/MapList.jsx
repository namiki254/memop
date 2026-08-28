import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

//表記揺れを整える関数
function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u30A1-\u30F6]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    );
}

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

      try {
        // 今のフォルダ自身と，そこから親をたどってパンくずを組み立てる．
        let currentFolder = null;
        const crumbs = [];
        let cursor = folderId;
        while (cursor) {
          const { data, error: folderError } = await supabase
            .from("folders")
            .select("*")
            .eq("id", cursor)
            .single();

          if (cancelled) return;
          if (folderError) throw folderError;

          if (!currentFolder) currentFolder = data;
          crumbs.unshift(data);
          cursor = data.parent_folder_id;
        }

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

  // フォルダを削除する
  async function handleDeleteFolder(folder) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== folder.user_id) {
      setFolderError("このフォルダは削除できません．");
      return;
    }

    if (!window.confirm(`「${folder.name}」を削除しますか？`)) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("folders")
      .delete()
      .eq("id", folder.id);

    if (deleteError) {
      console.error("フォルダの削除に失敗", deleteError);
      setFolderError(`削除に失敗しました．${deleteError.message}`);
      return;
    }

    setChildFolders((current) =>
      current.filter((f) => f.id !== folder.id),
    );
    window.location.reload();
  }

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  return (
    <div className="h-full overflow-auto p-6">
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
        className="mt-3 w-full max-w-sm rounded border border-slate-300 px-3 py-1.5 text-sm"
      />

      {isEmpty ? (
        <p className="mt-6 text-slate-500">
          {trimmedQuery
            ? `「${trimmedQuery}」に一致するものが見つかりません．`
            : "ここには何もありません．"}
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {visibleFolders.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              {/* フォルダ名をクリックするとフォルダを開く */}
            <Link
              to={`/folders/${f.id}`}
              className="flex flex-1 items-center gap-3 hover:opacity-70"
            >
              <span className="text-2xl">📁</span>
              <span className="font-bold text-slate-800">{f.name}</span>
            </Link>

            {/* 作成者だけ削除ボタンを表示する */}
            {currentUser?.id === f.user_id && (
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
            <Link
              key={map.id}
              to={`/maps/${map.id}`}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              {map.image_url ? (
                <img
                  src={map.image_url}
                  alt={map.title}
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="h-40 w-full bg-slate-200" />
              )}

              <div className="p-4">
                <h3 className="font-bold text-slate-800">{map.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {map.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
