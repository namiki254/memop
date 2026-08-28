import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";

// 表記揺れを整える関数
function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u30A1-\u30F6]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    );
}

export default function MapList() {
  const { folderId } = useParams();

  const [folder, setFolder] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [childFolders, setChildFolders] = useState([]);
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  // displayType の State を定義（"all" | "maps" | "folders"）
  const [displayType, setDisplayType] = useState("all");

  useEffect(() => {
    if (sortKey === "title") {
      setSortOrder("asc");
    } else if (sortKey === "created_at" || sortKey === "updated_at") {
      setSortOrder("desc");
    }
  }, [sortKey]);

  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);

  // マップの絞り込み
  const filteredMaps = maps.filter((map) => {
    const matchesType = displayType === "all" || displayType === "maps";
    const matchesSearch = !trimmedQuery || normalizeSearchText(map.title).includes(normalizedQuery);
    const matchesFavorite = !showOnlyFavorites || map.is_favorited;
    return matchesType && matchesSearch && matchesFavorite;
  });

  // フォルダの絞り込み
  const filteredFolders = childFolders.filter((f) => {
    const matchesType = displayType === "all" || displayType === "folders";
    const matchesSearch = !trimmedQuery || normalizeSearchText(f.name).includes(normalizedQuery);
    const matchesFavorite = !showOnlyFavorites || f.is_favorited;
    return matchesType && matchesSearch && matchesFavorite;
  });

  // マップの並び替え処理
  const visibleMaps = [...filteredMaps].sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];

    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    if (typeof valA === "string") {
      const cmp = valA.localeCompare(valB, "ja");
      return sortOrder === "asc" ? cmp : -cmp;
    }
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // フォルダの並び替え処理
  const visibleFolders = [...filteredFolders].sort((a, b) => {
    // フォルダは title ではなく name プロパティを使用
    const key = sortKey === "title" ? "name" : sortKey;
    let valA = a[key];
    let valB = b[key];

    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    if (typeof valA === "string") {
      const cmp = valA.localeCompare(valB, "ja");
      return sortOrder === "asc" ? cmp : -cmp;
    }
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const isEmpty = visibleFolders.length === 0 && visibleMaps.length === 0;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        let currentFolder = null;
        const crumbs = [];
        let cursor = folderId;

        while (cursor) {
          const { data, error: folderError } = await supabase
            .from("folders")
            .select("*, folder_favorites(user_id)")
            .eq("id", cursor)
            .single();

          if (cancelled) return;
          if (folderError) throw folderError;

          if (!currentFolder) currentFolder = data;
          crumbs.unshift(data);
          cursor = data.parent_folder_id;
        }

        const { data: folders, error: foldersError } = folderId
          ? await supabase
            .from("folders")
            .select("*, folder_favorites(user_id)")
            .eq("parent_folder_id", folderId)
            .order("name")
          : await supabase
            .from("folders")
            .select("*, folder_favorites(user_id)")
            .is("parent_folder_id", null)
            .order("name");

        if (cancelled) return;
        if (foldersError) throw foldersError;

        const { data: { user } } = await supabase.auth.getUser();

        const formattedFolders = (folders ?? []).map((f) => {
          const favorites = f.folder_favorites || [];
          return {
            ...f,
            is_favorited: user ? favorites.some((fav) => fav.user_id === user.id) : false,
          };
        });

        const { data: mapsData, error: mapsError } = folderId
          ? await supabase
            .from("maps")
            .select("*, map_favorites(user_id)")
            .eq("folder_id", folderId)
          : await supabase
            .from("maps")
            .select("*, map_favorites(user_id)")
            .is("folder_id", null);

        if (cancelled) return;
        if (mapsError) throw mapsError;

        const formattedMaps = (mapsData ?? []).map((map) => {
          const favorites = map.map_favorites || [];
          return {
            ...map,
            is_favorited: user ? favorites.some((fav) => fav.user_id === user.id) : false,
          };
        });

        setFolder(currentFolder);
        setBreadcrumb(crumbs);
        setChildFolders(formattedFolders);
        setMaps(formattedMaps);
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

  async function handleCreateFolder(event) {
    event.preventDefault();
    if (creatingFolder) return;

    const name = newFolderName.trim();
    if (!name) return;

    setCreatingFolder(true);
    setFolderError("");

    try {
      const { data: created, error: insertError } = await supabase
        .from("folders")
        .insert({ name, parent_folder_id: folderId ?? null })
        .select()
        .single();

      if (insertError) {
        console.error("フォルダの作成に失敗", insertError);
        setFolderError(`作成に失敗しました．${insertError.message}`);
        return;
      }

      setChildFolders((current) =>
        [...current, { ...created, is_favorited: false }].sort((a, b) =>
          a.name.localeCompare(b.name, "ja")
        )
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

  async function toggleFavorite(event, mapId, isFavorited) {
    event.preventDefault();
    event.stopPropagation();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("お気に入り機能を利用するにはログインが必要です.");
      return;
    }

    try {
      if (isFavorited) {
        const { error: deleteError } = await supabase
          .from("map_favorites")
          .delete()
          .eq("map_id", mapId)
          .eq("user_id", user.id);

        if (deleteError) throw deleteError;
      } else {
        const { error: insertError } = await supabase
          .from("map_favorites")
          .insert({ map_id: mapId, user_id: user.id });

        if (insertError) throw insertError;
      }

      setMaps((prevMaps) =>
        prevMaps.map((m) =>
          m.id === mapId ? { ...m, is_favorited: !isFavorited } : m
        )
      );
    } catch (e) {
      console.error("マップのお気に入りの更新に失敗しました", e);
      alert(`お気に入りの更新に失敗しました. ${e.message}`);
    }
  }

  async function toggleFolderFavorite(event, folderId, isFavorited) {
    event.preventDefault();
    event.stopPropagation();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("お気に入り機能を利用するにはログインが必要です.");
      return;
    }

    try {
      if (isFavorited) {
        const { error: deleteError } = await supabase
          .from("folder_favorites")
          .delete()
          .eq("folder_id", folderId)
          .eq("user_id", user.id);

        if (deleteError) throw deleteError;
      } else {
        const { error: insertError } = await supabase
          .from("folder_favorites")
          .insert({ folder_id: folderId, user_id: user.id });

        if (insertError) throw insertError;
      }

      setChildFolders((prevFolders) =>
        prevFolders.map((f) =>
          f.id === folderId ? { ...f, is_favorited: !isFavorited } : f
        )
      );
    } catch (e) {
      console.error("フォルダのお気に入り更新に失敗しました", e);
      alert(`お気に入りの更新に失敗しました. ${e.message}`);
    }
  }

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  return (
    <div className="h-full overflow-auto p-6">
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

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="マップ・フォルダを名前で検索"
          className="w-full max-w-sm rounded border border-slate-300 px-3 py-1.5 text-sm"
        />

        <button
          type="button"
          onClick={() => setShowOnlyFavorites((prev) => !prev)}
          className={`flex items-center gap-1 rounded border px-3 py-1.5 text-sm transition ${showOnlyFavorites
            ? "border-red-300 bg-red-50 font-bold text-red-600"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
        >
          <span className={showOnlyFavorites ? "text-red-500" : "text-slate-400"}>♥</span>
          お気に入りのみ
        </button>

        <div className="flex items-center overflow-hidden rounded border border-slate-300 bg-white text-sm">
          <button
            type="button"
            onClick={() => setDisplayType("all")}
            className={`px-3 py-1.5 transition ${displayType === "all"
              ? "bg-slate-800 font-bold text-white"
              : "text-slate-600 hover:bg-slate-50"
              }`}
          >
            すべて
          </button>
          <button
            type="button"
            onClick={() => setDisplayType("maps")}
            className={`border-l border-slate-300 px-3 py-1.5 transition ${displayType === "maps"
              ? "bg-slate-800 font-bold text-white"
              : "text-slate-600 hover:bg-slate-50"
              }`}
          >
            マップのみ
          </button>
          <button
            type="button"
            onClick={() => setDisplayType("folders")}
            className={`border-l border-slate-300 px-3 py-1.5 transition ${displayType === "folders"
              ? "bg-slate-800 font-bold text-white"
              : "text-slate-600 hover:bg-slate-50"
              }`}
          >
            フォルダのみ
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <label htmlFor="sortKeySelect">並び替え:</label>
          <select
            id="sortKeySelect"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="created_at">作成日</option>
            <option value="updated_at">更新日</option>
            <option value="title">タイトル</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="desc">降順 (大きい順/新しい順)</option>
            <option value="asc">昇順 (小さい順/古い順)</option>
          </select>
        </div>
      </div>

      {isEmpty ? (
        <p className="mt-6 text-slate-500">
          {trimmedQuery
            ? `「${trimmedQuery}」に一致するものが見つかりません．`
            : "ここには何もありません．"}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {visibleFolders.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-500">フォルダ</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {visibleFolders.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50"
                  >
                    <Link
                      to={`/folders/${f.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span className="flex-shrink-0 text-2xl">📁</span>
                      <span className="truncate font-bold text-slate-800">{f.name}</span>
                    </Link>

                    <button
                      type="button"
                      onClick={(e) => toggleFolderFavorite(e, f.id, f.is_favorited)}
                      className="flex-shrink-0 transition hover:scale-110"
                      title={f.is_favorited ? "お気に入り解除" : "お気に入り登録"}
                    >
                      <span
                        className={`text-3xl ${f.is_favorited ? "text-red-500" : "text-slate-300"
                          }`}
                      >
                        ♥
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {visibleMaps.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-500">マップ</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {visibleMaps.map((map) => (
                  <div
                    key={map.id}
                    className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition"
                  >
                    <Link to={`/maps/${map.id}`} className="block">
                      {map.image_url ? (
                        <img
                          src={map.image_url}
                          alt={map.title}
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="h-40 w-full bg-slate-200" />
                      )}

                      <div className="p-4 pr-12">
                        <h3 className="font-bold text-slate-800">{map.title}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {map.description}
                        </p>
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(e, map.id, map.is_favorited)}
                      className="absolute bottom-4 right-4 z-10 flex items-center gap-1 text-sm transition hover:scale-110"
                      title={map.is_favorited ? "お気に入り解除" : "お気に入り登録"}
                    >
                      <span
                        className={`text-3xl ${map.is_favorited ? "text-red-500" : "text-slate-300"
                          }`}
                      >
                        ♥
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}