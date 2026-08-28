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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");

  // マップ・フォルダを名前で検索する．
  // 通信は増やさず，すでに取得済みの maps / childFolders を絞り込むだけ．
  const [searchQuery, setSearchQuery] = useState("");

  // 並び替え用のキー（初期値: 登録日 "created_at"）
  // 選択肢: "created_at"(登録日), "updated_at"(更新日), "favorite_count"(お気に入り数), "title"(名前順)
  const [sortKey, setSortKey] = useState("created_at");
  // 並び替えの向き（初期値: 降順 "desc" -> 新しい順、多い順）
  // 選択肢: "desc"(降順), "asc"(昇順)
  const [sortOrder, setSortOrder] = useState("desc");

  // 昇順/降順の自動切換
  useEffect(() => {
    if (sortKey === "title") {
      // タイトル順のときは「昇順 (あ→ん/A→Z)」にする
      setSortOrder("asc");
    } else if (sortKey === "created_at" || sortKey === "updated_at") {
      // 作成日・更新日のときは「降順 (新しい順)」にする
      setSortOrder("desc");
    }
  }, [sortKey]);

  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);

  // const visibleMaps = trimmedQuery
  //   ? maps.filter((map) =>
  //     normalizeSearchText(map.title).includes(normalizedQuery),
  //   )
  //   : maps;

  // 並び替えロジックの計算処理: sortKey, sortOrderを使ってvisibleMapsをソート
  // 検索クエリで絞り込み
  const filteredMaps = trimmedQuery
    ? maps.filter((map) =>
      normalizeSearchText(map.title).includes(normalizedQuery),
    )
    : maps;

  // 選択されたsortKeyとsortOrderに基づいて並び替え
  const visibleMaps = [...filteredMaps].sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];
    // 文字列の比較
    if (typeof valA === "string") {
      const cmp = valA.localeCompare(valB, "ja");
      return sortOrder === "asc" ? cmp : -cmp;
    }
    // 数値や日付の比較
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const visibleFolders = trimmedQuery
    ? childFolders.filter((f) =>
      normalizeSearchText(f.name).includes(normalizedQuery),
    )
    : childFolders;
  const isEmpty = visibleFolders.length === 0 && visibleMaps.length === 0;

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

        // const { data: mapsData, error: mapsError } = folderId
        //   ? await supabase
        //     .from("maps")
        //     .select("*")
        //     .eq("folder_id", folderId)
        //     .order("created_at", { ascending: false })
        //   : await supabase
        //     .from("maps")
        //     .select("*")
        //     .is("folder_id", null)
        //     .order("created_at", { ascending: false });

        // maps単体ではなく、map_favoritesも同時に取得
        // ログイン中のユーザー情報を取得（お気に入り判定に使用）
        const { data: { user } } = await supabase.auth.getUser();

        // mapsテーブルの取得時にmap_favoritesのuser_id一覧もセットで取得する
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

        // 取得したデータを加工して、お気に入り数（favorite_count）と自分が登録済か（is_favorites）を追加
        const formattedMaps = (mapsData ?? []).map((map) => {
          const favorites = map.map_favorites || [];
          return {
            ...map,
            // お気に入りさている件数
            favorite_count: favorites.length,
            // ログインユーザーが自分のお気に入りリストに含まれているか
            is_favorited: user ? favorites.some((fav) => fav.user_id === user.id) : false,
          };
        });

        setFolder(currentFolder);
        setBreadcrumb(crumbs);
        setChildFolders(folders ?? []);
        // setMaps(mapsData ?? []);
        // StateへのセットをformattedMapsに変更
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

  // マップのお気に入り状態を切り替える関数（ON/OFF）を追加
  async function toggleFavorite(event, mapId, isFavorited) {
    // 親要素（Linkタグ）へのクリックイベント伝播（ページ遷移）を防ぐ
    event.preventDefault();
    event.stopPropagation();

    // ログインチェック
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("お気に入り機能を利用するにはログインが必要です. ");
      return;
    }

    try {
      if (isFavorited) {
        // 既にお気に入り登録済なら解除する（map_favoritesから削除）
        const { error: deleteError } = await supabase
          .from("map_favorites")
          .delete()
          .eq("map_id", mapId)
          .eq("user_id", user.id);

        if (deleteError) throw deleteError;
      }
      else {
        // お気に入り未登録ならお気に入りに追加（map_favoriteに追加）
        const { error: insertError } = await supabase
          .from("map_favorites")
          .insert({ map_id: mapId, user_id: user.id });

        if (insertError) throw insertError;
      }

      // 画面上のStateを手動で更新（再読み込みなしで即座に数字と見た目を切り替える）
      setMaps((prevMaps) =>
        prevMaps.map((m) => {
          if (m.id === mapId) {
            return {
              ...m,
              is_favorited: !isFavorited,
              favorite_count: isFavorited
                ? m.favorite_count - 1
                : m.favorite_count + 1,
            };
          }
          return m;
        })
      );
    } catch (e) {
      console.error("お気に入りの更新に失敗しました", e);
      alert("お気に入りの更新に失敗しました. , ${e.message}")
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

      {/* 検索入力欄と並び替えセレクトボックスを１つの親要素(div)でまとめる */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="マップ・フォルダを名前で検索"
          className="w-full max-w-sm rounded border border-slate-300 px-3 py-1.5 text-sm"
        />

        {/* 並び替えセレクトボックス */}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <label htmlFor="sortKeySelect">並び替え:</label>
          <select
            id="sortKeySelect"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm bg-white"
          >
            <option value="created_at">作成日</option>
            <option value="updated_at">更新日</option>
            {/* <option value="favorite_count">お気に入り数</option> */}
            <option value="title">タイトル</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm bg-white"
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
          {/* フォルダ一覧のセクション */}
          {visibleFolders.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-500">フォルダ</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {visibleFolders.map((f) => (
                  <Link
                    key={f.id}
                    to={`/folders/${f.id}`}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50"
                  >
                    <span className="text-2xl">📁</span>
                    <span className="font-bold text-slate-800">{f.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* マップ一覧のセクション */}
          {visibleMaps.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-500">マップ</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

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

                    {/* お気に入りボタンを追加 */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-slate-800">{map.title}</h3>

                        {/* お気に入りボタン */}
                        <button
                          type="button"
                          onClick={(e) => toggleFavorite(e, map.id, map.is_favorited)}
                          className="flex items-center gap-1 text-sm transition hover:scale-110"
                          title={map.is_favorited ? "お気に入り解除" : "お気に入り登録"}
                        >
                          <span className={`text-3xl ${map.is_favorited ? "text-red-500" : "text-slate-300"}`}>
                            ♥
                          </span>
                          {/* <span className="text-sm font-semibold text-slate-600">
                            {map.favorite_count}
                          </span> */}
                        </button>
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {map.description}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}