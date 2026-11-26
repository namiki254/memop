import { getMapVisibility, getMapVisibilityLabel } from "../lib/mapVisibility.js";
import { subscribeSavedMapsChanged } from "../lib/savedMaps.js";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { canManageContent } from "../lib/mapAccess";
import { getMapShareUrl } from "../lib/mapShareLinks";
import { useMapImage } from "../lib/mapImages";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import AuthButton from "../components/AuthButton";
import Icon from "../components/Icon.jsx";
import HomeLink from "../components/HomeLink.jsx";
import Breadcrumb from "../components/Breadcrumb.jsx";
import { showToast } from "../lib/toast.js";

import { normalizeSearchText } from "../lib/searchText";

import MoveMapModal from "../components/MoveMapModal";
import SaveToMyListButton from "../components/SaveToMyListButton";

import ThreeDotMenu, {
  MenuItem,
} from "../components/ThreeDotMenu";

function MapThumbnail({ map }) {
  const { src, loading, imageContainer } = useMapImage(map.image_url, true);
  // 画像を描き終えたら true．それまでは仮の面を見せておき，描けたらふわっと切り替える．
  const [shown, setShown] = useState(false);

  return (
    <div ref={imageContainer} className="relative h-full min-h-20 rounded-[inherit] sm:h-36">
      {/* 読み込み中の仮の面．枠の大きさは先に決まっているので，画像が出ても一覧はがたつかない． */}
      {(loading || (src && !shown)) && <div className="skeleton absolute inset-0 rounded-[inherit]" />}

      {src ? (
        <img
          src={src}
          alt=""
          decoding="async"
          onLoad={() => setShown(true)}
          onError={() => setShown(true)}
          // absolute で枠いっぱいに敷く．画像の縦横比でカードの高さが変わらないようにするため
          // （ふつうに置くと，スマホでは縦長の画像ほどカードが縦に伸びてしまう）．
          className={`absolute inset-0 h-full w-full rounded-[inherit] object-cover transition-opacity duration-300 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
        />
      ) : !loading && (
        <div className="grid h-full place-items-center px-1 text-center text-xs text-faint">
          画像を表示できません
        </div>
      )}
    </div>
  );
}

// 一覧の先頭に置く，公開マップ一覧への入口．ふつうのマップと見分けられるよう色を変えている．
function PublicMapsCard({ className = "" }) {
  return (
    <Link
      to="/public-maps"
      className={`flex min-h-14 items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-left hover:border-accent/60 ${className}`}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-white">
        <Icon name="globe" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">公開マップ</span>
        <span className="block truncate text-xs text-sub">みんなが公開しているマップを見る</span>
      </span>
      <Icon name="chevronRight" className="size-5 text-accent-strong" />
    </Link>
  );
}

function FavoriteButton({ active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? "お気に入り解除" : "お気に入り登録"}
      title={active ? "お気に入り解除" : "お気に入り登録"}
      className={`btn-icon ${active ? "text-accent" : "text-line-strong hover:text-sub"}`}
    >
      <Icon name="heart" filled={active} className="size-5" />
    </button>
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
export default function MapList({ currentUser, authChecked, isAdmin, publicOnly = false }) {
  const { folderId } = useParams();
  const navigate = useNavigate();

  // 今いるフォルダ自身．トップ階層のときは null．
  const [folder, setFolder] = useState(null);
  // 今のフォルダより上の階層．パンくずの表示に使う．
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [childFolders, setChildFolders] = useState([]);
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadedListKey = useRef(null);
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

  // 今開いているフォルダの名前編集に使う状態
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [updatingFolder, setUpdatingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState(null);
  const [folderListVersion, setFolderListVersion] = useState(0);

  const [openMenu, setOpenMenu] = useState(null);
  const [copiedMenu, setCopiedMenu] = useState(null);

  async function copyItemUrl(type, id) {
    const menuKey = `${type}-${id}`;
    try {
      const map = maps.find((entry) => entry.id === id);
      const url = type === "map"
        ? await getMapShareUrl(id, map, canManageContent(map, currentUser?.id, isAdmin))
        : new URL(`/folders/${id}`, window.location.origin).href;
      await navigator.clipboard.writeText(url);

      setCopiedMenu(menuKey);

      setTimeout(() => {
        setCopiedMenu((current) =>
          current === menuKey ? null : current,
        );
      }, 2000);
    } catch (error) {
      setFolderError(`URLのコピーに失敗しました。${error.message}`);
    }
  }

  // マップ・フォルダを名前で検索する．
  // 通信は増やさず，すでに取得済みの maps / childFolders を絞り込むだけ．
  const [searchQuery, setSearchQuery] = useState("");

  // 並び替え・お気に入り絞り込み・種類絞り込み
  const [sortKey, setSortKey] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  // "all" | "maps" | "folders"
  const [displayType, setDisplayType] = useState("all");

  // 並び替え基準を変えたときは，その基準に合った向きへ初期化する
  useEffect(() => {
    if (sortKey === "title") {
      setSortOrder("asc");
    } else if (sortKey === "created_at" || sortKey === "updated_at") {
      setSortOrder("desc");
    }
  }, [sortKey]);

  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);

  function compareByKey(key) {
    return (a, b) => {
      const valA = a[key];
      const valB = b[key];
      const aMissing = valA === undefined || valA === null;
      const bMissing = valB === undefined || valB === null;

      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;

      if (typeof valA === "string") {
        return valA.localeCompare(valB, "ja");
      }
      if (valA < valB) return -1;
      if (valA > valB) return 1;
      return 0;
    };
  }

  const filteredMaps = maps.filter((map) => {
    const matchesType = displayType === "all" || displayType === "maps";
    const matchesSearch =
      !trimmedQuery ||
      normalizeSearchText(map.title).includes(normalizedQuery);
    const matchesFavorite = !showOnlyFavorites || map.is_favorited;
    return matchesType && matchesSearch && matchesFavorite;
  });

  const filteredFolders = childFolders.filter((f) => {
    const matchesType = displayType === "all" || displayType === "folders";
    const matchesSearch =
      !trimmedQuery || normalizeSearchText(f.name).includes(normalizedQuery);
    const matchesFavorite = !showOnlyFavorites || f.is_favorited;
    return matchesType && matchesSearch && matchesFavorite;
  });

  const visibleMaps = [...filteredMaps].sort((a, b) => {
    const cmp = compareByKey(sortKey)(a, b);
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const visibleFolders = [...filteredFolders].sort((a, b) => {
    // フォルダは title ではなく name プロパティを使う
    const key = sortKey === "title" ? "name" : sortKey;
    const cmp = compareByKey(key)(a, b);
    return sortOrder === "asc" ? cmp : -cmp;
  });
  const isEmpty = visibleFolders.length === 0 && visibleMaps.length === 0;
  const showPublicMapsCard = !folderId && !publicOnly;

  useEffect(() => {
    setIsEditingFolder(false);
    setEditingFolderName("");
    setFolderError("");
  }, [folderId]);

  useEffect(() => {
    let cancelled = false;

    const listKey = JSON.stringify([folderId, publicOnly, currentUser?.id, authChecked]);
    async function load() {
      if (loadedListKey.current !== listKey) setLoading(true);
      setError(null);
      setFolderNotFound(false);

      try {
        if (!authChecked) {
          return;
        }

        if (publicOnly) {
          // 全公開マップを取得してから、既存の名前検索・並び替えを適用する。
          const publicMaps = [];
          for (let start = 0; ; start += 500) {
            const { data, error } = await supabase.from("maps")
              .select(currentUser ? "*, map_favorites(user_id)" : "*")
              .eq("visibility", "public").order("created_at", { ascending: false }).order("id")
              .range(start, start + 499);
            if (cancelled) return;
            if (error) throw error;
            publicMaps.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          setFolder(null);
          setBreadcrumb([]);
          setChildFolders([]);
          setAllFolders([]);
          setMaps(publicMaps.map((map) => ({ ...map,
            is_favorited: (map.map_favorites ?? []).some((fav) => fav.user_id === currentUser?.id),
          })));
          return;
        }

        // トップページで非ログインの場合は一覧を表示しない
        if (!folderId && !currentUser) {
          setFolder(null);
          setBreadcrumb([]);
          setChildFolders([]);
          setMaps([]);
          return;
        }

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

        // 移動先の選択欄に表示するフォルダを取得する．
        // 全ユーザーの全フォルダを無条件に見せると，自分が一度も開いたことのない
        // 他人のフォルダの名前・階層構造まで見えてしまうため，
        // 「自分の・持ち主なし・保存済み」のフォルダだけに絞る．
        let foldersForMoveQuery = supabase
          .from("folders")
          .select("id, name, parent_folder_id, user_id")
          .order("name");

        foldersForMoveQuery = currentUser
          ? foldersForMoveQuery.or(
            `user_id.eq.${currentUser.id},user_id.is.null`,
          )
          : foldersForMoveQuery.is("user_id", null);

        const { data: ownFoldersForMove, error: foldersForMoveError } =
          await foldersForMoveQuery;

        if (cancelled) return;
        if (foldersForMoveError) throw foldersForMoveError;

        let savedFoldersForMove = [];

        if (currentUser) {
          const {
            data: savedFolderRowsForMove,
            error: savedFolderRowsForMoveError,
          } = await supabase
            .from("saved_folders")
            .select("folder_id")
            .eq("user_id", currentUser.id);

          if (cancelled) return;
          if (savedFolderRowsForMoveError) throw savedFolderRowsForMoveError;

          const savedFolderIdsForMove = (savedFolderRowsForMove ?? []).map(
            (row) => row.folder_id,
          );

          if (savedFolderIdsForMove.length > 0) {
            const {
              data: savedFolderDataForMove,
              error: savedFolderDataForMoveError,
            } = await supabase
              .from("folders")
              .select("id, name, parent_folder_id, user_id")
              .in("id", savedFolderIdsForMove);

            if (cancelled) return;
            if (savedFolderDataForMoveError) throw savedFolderDataForMoveError;

            savedFoldersForMove = savedFolderDataForMove ?? [];
          }
        }

        const mergedFoldersForMove = [
          ...(ownFoldersForMove ?? []),
          ...savedFoldersForMove,
        ];
        const foldersForMove = Array.from(
          new Map(
            mergedFoldersForMove.map((f) => [f.id, f]),
          ).values(),
        );

        // トップ階層なら parent_folder_id / folder_id が null のものだけ．
        let foldersQuery = supabase
          .from("folders")
          .select("*, folder_favorites(user_id)")
          .order("name");

        if (folderId) {
          // 共有フォルダの中では、今まで通り子フォルダを取得
          foldersQuery = foldersQuery.eq("parent_folder_id", folderId);
        } else {
          // トップでは、自分が作ったフォルダだけ取得
          foldersQuery = foldersQuery
            .is("parent_folder_id", null)
            .eq("user_id", currentUser.id);
        }

        const { data: folders, error: foldersError } = await foldersQuery;

        if (cancelled) return;
        if (foldersError) throw foldersError;

        // トップでは、自分が保存したフォルダも取得する
        let savedFolders = [];

        if (!folderId) {
          const { data: savedFolderRows, error: savedFoldersError } = await supabase
            .from("saved_folders")
            .select("folder_id")
            .eq("user_id", currentUser.id);

          if (cancelled) return;
          if (savedFoldersError) throw savedFoldersError;

          const savedFolderIds = (savedFolderRows ?? []).map(
            (row) => row.folder_id,
          );

          if (savedFolderIds.length > 0) {
            const { data, error: savedFolderDataError } = await supabase
              .from("folders")
              .select("*, folder_favorites(user_id)")
              .in("id", savedFolderIds);

            if (cancelled) return;
            if (savedFolderDataError) throw savedFolderDataError;

            savedFolders = data ?? [];
          }
        }

        let mapsQuery = supabase
          .from("maps")
          .select("*, map_favorites(user_id)")
          .order("created_at", { ascending: false });

        if (folderId) {
          // 共有フォルダの中では、今まで通りそのフォルダのマップを取得
          mapsQuery = mapsQuery.eq("folder_id", folderId);
        } else {
          // トップでは、自分が作ったマップだけ取得
          mapsQuery = mapsQuery
            .is("folder_id", null)
            .eq("user_id", currentUser.id);
        }

        const { data: mapsData, error: mapsError } = await mapsQuery;

        if (cancelled) return;
        if (mapsError) throw mapsError;

        // トップでは、自分が保存したマップも取得する
        let savedMaps = [];

        if (!folderId) {
          const { data: savedMapRows, error: savedMapsError } = await supabase
            .from("saved_maps")
            .select("map_id")
            .eq("user_id", currentUser.id);

          if (cancelled) return;
          if (savedMapsError) throw savedMapsError;

          const savedMapIds = (savedMapRows ?? []).map((row) => row.map_id);

          if (savedMapIds.length > 0) {
            const { data, error: savedMapDataError } = await supabase
              .from("maps")
              .select("*, map_favorites(user_id)")
              .in("id", savedMapIds);

            if (cancelled) return;
            if (savedMapDataError) throw savedMapDataError;

            savedMaps = data ?? [];
          }
        }

        setFolder(currentFolder);
        setBreadcrumb(crumbs);

        const mergedFolders = [...(folders ?? []), ...savedFolders];

        const uniqueFolders = Array.from(
          new Map(mergedFolders.map((folder) => [folder.id, folder])).values(),
        );

        // お気に入りは，取得した folder_favorites / map_favorites の中に
        // 自分の user_id があるかどうかで判定する．
        const formattedFolders = uniqueFolders.map((f) => ({
          ...f,
          is_favorited: currentUser
            ? (f.folder_favorites ?? []).some(
              (fav) => fav.user_id === currentUser.id,
            )
            : false,
        }));

        setChildFolders(formattedFolders);
        setAllFolders(foldersForMove ?? []);

        const mergedMaps = [...(mapsData ?? []), ...savedMaps];

        const uniqueMaps = Array.from(
          new Map(mergedMaps.map((map) => [map.id, map])).values(),
        );

        const formattedMaps = uniqueMaps.map((m) => ({
          ...m,
          is_favorited: currentUser
            ? (m.map_favorites ?? []).some(
              (fav) => fav.user_id === currentUser.id,
            )
            : false,
        }));

        setMaps(formattedMaps);
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError);
        }
      } finally {
        if (!cancelled) {
          if (authChecked) loadedListKey.current = listKey;
          setLoading(false);
        }
      }
    }

    load();

    // folderIdが変わったら、前の取得結果を無効にする
    return () => {
      cancelled = true;
    };
  }, [folderId, currentUser, authChecked, folderListVersion, publicOnly]);

  useEffect(() => {
    function refresh() { if (document.visibilityState === "visible") setFolderListVersion((version) => version + 1); }
    const unsubscribe = subscribeSavedMapsChanged(refresh);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => { unsubscribe(); window.removeEventListener("focus", refresh); window.clearInterval(interval); };
  }, []);

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
    if (!canManageContent(map, currentUser?.id, isAdmin)) {
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

      const canMove = canManageContent(movingMap, user?.id, isAdmin && user?.id === currentUser?.id);
      if (userError || !canMove) {
        setMoveError("このマップは移動できません。");
        return;
      }

      const { data: updatedMap, error: updateError } = await supabase
        .from("maps")
        .update({ folder_id: nextFolderId })
        .eq("id", movingMap.id)
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
        `予期しないエラーが発生しました。${unexpectedError?.message ?? unexpectedError
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
        [...current, { ...created, is_favorited: false }].sort((a, b) =>
          a.name.localeCompare(b.name, "ja"),
        ),
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

  // 今開いているフォルダの名前を更新する
  async function handleUpdateFolder() {
    if (!folder || updatingFolder || deletingFolderId !== null) return;

    const name = editingFolderName.trim();

    if (!name) {
      setFolderError("フォルダ名を入力してください。");
      return;
    }

    setUpdatingFolder(true);
    setFolderError("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      // 保存直前にログイン中の人を確認する。管理者かの最終判断は Supabase が行う。
      if (userError || !canManageContent(folder, user?.id, isAdmin && user?.id === currentUser?.id)) {
        setFolderError("このフォルダは編集できません。");
        return;
      }

      // 名前だけを渡し、作成者・階層はデータベース側で保持する。
      const { data: updatedFolder, error: updateError } = await supabase.rpc("rename_folder", {
        target_folder_id: folder.id,
        expected_name: folder.name,
        new_name: name,
      });

      if (updateError) {
        console.error("フォルダ名の更新に失敗", updateError);
        setFolderError("フォルダ名を保存できませんでした。再読み込みして最新の状態を確認してください。");
        return;
      }

      if (!updatedFolder) {
        setFolderError("フォルダを更新できませんでした。入力した名前を控えて再読み込みしてください。");
        return;
      }

      setFolder(updatedFolder);
      setBreadcrumb((current) =>
        current.map((f) =>
          f.id === updatedFolder.id ? updatedFolder : f,
        ),
      );

      setIsEditingFolder(false);
    } catch (e) {
      console.error("フォルダ名の更新中に予期しないエラー", e);
      setFolderError(
        `予期しないエラーが発生しました。${e?.message ?? e}`,
      );
    } finally {
      setUpdatingFolder(false);
    }
  }

  async function handleDeleteFolder(targetFolder) {
    if (updatingFolder || deletingFolderId !== null) return;
    setDeletingFolderId(targetFolder.id);
    setFolderError("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      const canDelete = !userError && user && (
        targetFolder.user_id === null
        || canManageContent(targetFolder, user.id, isAdmin && user.id === currentUser?.id)
      );
      if (!canDelete) {
        setFolderError("このフォルダは削除できません。");
        return;
      }

      // マップと子フォルダの移動先を、削除を確定する前に伝える。
      const destination = targetFolder.parent_folder_id ? "親フォルダ" : "ホーム";
      if (!window.confirm(`「${targetFolder.name}」を削除しますか？\n中のマップと子フォルダは${destination}へ移動します。`)) return;

      const { data: deleted, error: deleteError } = await supabase.rpc("delete_folder", {
        target_folder_id: targetFolder.id,
        expected_parent_folder_id: targetFolder.parent_folder_id,
      });
      if (deleteError) {
        console.error("フォルダの削除に失敗", deleteError);
        setFolderError("フォルダを削除できませんでした。再読み込みして最新の状態を確認してください。");
        return;
      }

      // 移動されたマップと子フォルダも、保存先の一覧を取り直して反映する。
      setFolderListVersion((version) => version + 1);
      if (!deleted) setFolderError("このフォルダはすでに削除されています。");
      if (targetFolder.id === folderId) {
        navigate(targetFolder.parent_folder_id ? `/folders/${targetFolder.parent_folder_id}` : "/");
      }
    } catch (deleteError) {
      console.error("フォルダ削除中の通信に失敗", deleteError);
      setFolderError("フォルダの削除結果を確認できませんでした。再読み込みしてください。");
    } finally {
      setDeletingFolderId(null);
    }
  }

  // フォルダのURLをコピーする
  async function copyFolderUrl() {
    setFolderError("");

    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("フォルダのURLをコピーしました。");
    } catch (error) {
      setFolderError(`URLのコピーに失敗しました. ${error.message}`);
    }
  }

  // マップのお気に入りを切り替える
  async function toggleFavorite(event, mapId, isFavorited) {
    event.preventDefault();
    event.stopPropagation();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showToast("お気に入りに登録するにはログインしてください。", { tone: "error" });
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

      setMaps((current) =>
        current.map((m) =>
          m.id === mapId ? { ...m, is_favorited: !isFavorited } : m,
        ),
      );
    } catch (e) {
      console.error("マップのお気に入りの更新に失敗しました", e);
      showToast(`お気に入りを更新できませんでした。${e.message}`, { tone: "error" });
    }
  }

  // フォルダのお気に入りを切り替える
  async function toggleFolderFavorite(event, targetFolderId, isFavorited) {
    event.preventDefault();
    event.stopPropagation();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      showToast("お気に入りに登録するにはログインしてください。", { tone: "error" });
      return;
    }

    try {
      if (isFavorited) {
        const { error: deleteError } = await supabase
          .from("folder_favorites")
          .delete()
          .eq("folder_id", targetFolderId)
          .eq("user_id", user.id);

        if (deleteError) throw deleteError;
      } else {
        const { error: insertError } = await supabase
          .from("folder_favorites")
          .insert({ folder_id: targetFolderId, user_id: user.id });

        if (insertError) throw insertError;
      }

      setChildFolders((current) =>
        current.map((f) =>
          f.id === targetFolderId
            ? { ...f, is_favorited: !isFavorited }
            : f,
        ),
      );
    } catch (e) {
      console.error("フォルダのお気に入り更新に失敗しました", e);
      showToast(`お気に入りを更新できませんでした。${e.message}`, { tone: "error" });
    }
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
          <HomeLink className="btn mt-3" />
        </div>
      </div>
    );
  }

  if (!publicOnly && !folderId && !currentUser) {
    return (
      <div className="h-full overflow-auto px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-xl font-bold text-ink">ログイン</h2>
          <p className="mt-2 text-sm leading-relaxed text-sub">
            画像を地図にして、気になる場所にピンとメモを残せます。マップを作る・保存するにはログインしてください。
          </p>

          <div className="mt-6">
            <AuthButton centered />
          </div>

          <div className="mt-8 border-t border-line pt-6">
            <p className="text-sm text-sub">公開マップはログインせずに閲覧できます。</p>
            <PublicMapsCard className="mt-3" />
          </div>
        </div>
      </div>
    );
  }

  // 並び替えは「何で」と「どちら向き」を1つの選択欄にまとめる（スマホで横にはみ出さないように）
  const sortOptions = [
    ["created_at:desc", "作成日が新しい順"],
    ["created_at:asc", "作成日が古い順"],
    ["updated_at:desc", "更新日が新しい順"],
    ["updated_at:asc", "更新日が古い順"],
    ["title:asc", "タイトル順（昇順）"],
    ["title:desc", "タイトル順（降順）"],
  ];

  const sortValue = `${sortKey}:${sortOrder}`;
  const sortLabel = sortOptions.find(([value]) => value === sortValue)?.[1] ?? "";
  function changeSort(value) {
    const [key, order] = value.split(":");
    setSortKey(key);
    setSortOrder(order);
  }

  // 絞り込みのチップの見た目．選んでいるものは濃い色で塗る（マップ詳細の種類切り替えと同じ色の使い方）
  function chipClassName(selected) {
    return `inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm sm:min-h-8 ${selected
      ? "border-ink bg-ink font-bold text-white"
      : "border-line-strong bg-surface text-sub hover:text-ink"
      }`;
  }

  const displayTypeOptions = [
    ["all", "すべて"],
    ["maps", "マップ"],
    ["folders", "フォルダ"],
  ];

  return (

    // data-scroll-root：サムネイルの遅延読み込み（lib/mapImages.js）が，
    // 「この箱の中で画面に近づいたか」を判定するための目印．
    <div data-scroll-root className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
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
      {/*
        公開マップの一覧はホームのすぐ下の1階層だけなので，パンくずではなく「← ホーム」の戻るリンクにする
        （ホームへのリンクは，どの画面でも HomeLink の「‹ ホーム」の形にそろえている）．
      */}
      {publicOnly && (
        <HomeLink className="-ml-1 mb-1 min-h-11 rounded-lg pl-0.5 pr-2 text-sm text-sub hover:bg-ink/5 hover:text-ink sm:min-h-9" />
      )}

      {/* パンくず（フォルダの中だけ）．最後は今開いているフォルダなので，リンクにせず文字だけで出す． */}
      {folderId && (
        <Breadcrumb folders={breadcrumb} currentIsLast className="mb-1 text-xs text-sub sm:text-sm" />
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {folder && isEditingFolder ? (
          <input
            type="text"
            aria-label="フォルダ名"
            value={editingFolderName}
            onChange={(e) => setEditingFolderName(e.target.value)}
            maxLength={100}
            className="field basis-full font-bold sm:basis-0 sm:grow sm:text-lg"
          />
        ) : (
          <h2 className="min-w-0 break-words text-xl font-bold text-ink">
            {publicOnly ? "公開マップ" : folder ? folder.name : "マップ一覧"}
          </h2>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* フォルダ画面でだけ保存ボタンを表示する（作成者本人には内部で非表示になる） */}
          {authChecked && folder && (
            <SaveToMyListButton
              itemType="folder"
              itemId={folder.id}
              ownerId={folder.user_id}
              currentUser={currentUser}
            />
          )}

          {/* 名前の変更中だけ，確定とキャンセルのボタンを出す */}
          {isEditingFolder && canManageContent(folder, currentUser?.id, isAdmin) && (
            <>
              <button
                type="button"
                onClick={() => setIsEditingFolder(false)}
                disabled={updatingFolder || deletingFolderId !== null}
                className="btn btn-sm"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={handleUpdateFolder}
                disabled={updatingFolder || deletingFolderId !== null || editingFolderName.trim() === ""}
                className="btn btn-sm btn-primary"
              >
                {updatingFolder ? "保存中…" : "保存"}
              </button>
            </>
          )}

          {!publicOnly && !isEditingFolder && <button
            type="button"
            onClick={startCreatingFolder}
            className="btn btn-sm"
          >
            <Icon name="plus" />
            フォルダ
          </button>}

          {/*
            フォルダの中では，URLのコピー・名前の変更・削除を「⋮」メニューにまとめる．
            ボタンを横に並べるとスマホで何段にも折り返し，マップにたどり着くまでが長くなるため．
            （マップのカードの「⋮」と同じ形）
          */}
          {folderId && folder && !isEditingFolder && (
            <ThreeDotMenu
              label={`${folder.name}の操作メニューを開く`}
              isOpen={openMenu === "current-folder"}
              onToggle={() => setOpenMenu((current) => current === "current-folder" ? null : "current-folder")}
              onClose={() => setOpenMenu(null)}
            >
              <MenuItem
                icon="link"
                onClick={() => {
                  setOpenMenu(null);
                  copyFolderUrl();
                }}
              >
                URLをコピー
              </MenuItem>

              {/* 作成者本人と管理者だけが，名前の変更と削除をできる */}
              {canManageContent(folder, currentUser?.id, isAdmin) && (
                <>
                  <MenuItem
                    icon="edit"
                    disabled={deletingFolderId !== null}
                    onClick={() => {
                      setOpenMenu(null);
                      setEditingFolderName(folder.name);
                      setIsEditingFolder(true);
                    }}
                  >
                    名前を変更
                  </MenuItem>
                  <MenuItem
                    icon="trash"
                    danger
                    disabled={updatingFolder || deletingFolderId !== null}
                    onClick={() => {
                      setOpenMenu(null);
                      handleDeleteFolder(folder);
                    }}
                  >
                    削除
                  </MenuItem>
                </>
              )}
            </ThreeDotMenu>
          )}
        </div>
      </div>


      {isCreatingFolder && (
        <form onSubmit={handleCreateFolder} className="mt-3 flex max-w-md flex-wrap gap-2">
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
            aria-label="新しいフォルダの名前"
            className="field basis-full sm:basis-0 sm:grow"
          />
          <button
            type="submit"
            disabled={creatingFolder || newFolderName.trim() === ""}
            className="btn btn-primary"
          >
            作成
          </button>
          <button
            type="button"
            onClick={cancelCreatingFolder}
            disabled={creatingFolder}
            className="btn"
          >
            キャンセル
          </button>
        </form>
      )}

      {folderError && (
        <p className="notice-error mt-2 max-w-md">
          {folderError}
        </p>
      )}

      {/*
        検索・絞り込み・並び替え．通販サイトのスマホ版と同じ組み立てにしている．
          1段目：検索欄
          1段目の右：お気に入りだけ表示（ハート）と，並び替え
          2段目：種類の絞り込みのチップ（入りきらない分は横にスクロール）
        スマホではこの2段を画面の上に貼り付け（sticky），一覧をスクロールしてもすぐ絞り込めるようにする．
        広い画面では1行に並べ，並び替えは右端の選択欄にする．
      */}
      <div className="sticky top-0 z-20 -mx-4 mt-2 flex flex-wrap items-center gap-2 border-b border-line bg-paper px-4 py-2 sm:static sm:mx-0 sm:mt-4 sm:border-0 sm:p-0">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={publicOnly ? "公開マップを検索" : "マップ・フォルダを検索"}
            aria-label={publicOnly ? "公開マップ名検索" : "マップ・フォルダ名検索"}
            className="field pl-9"
          />
        </div>

        {/*
          並び替え（スマホ）．アイコンのボタンの上に透明な選択欄を重ねているので，
          押すと端末の選択画面（iPhoneならドラムロール）が開く．今の並び順は読み上げ用に名前へ含める．
        */}
        {/*
          お気に入りだけを表示する切り替え．スマホはカードのハートと同じ印だけ，広い画面は「お気に入り」の文字も付ける．
          並び順（order）で，スマホでは検索欄のすぐ右，広い画面では右端の並び替えの左に来るようにしている．
        */}
        {currentUser && (
          <button
            type="button"
            onClick={() => setShowOnlyFavorites((prev) => !prev)}
            aria-pressed={showOnlyFavorites}
            aria-label="お気に入りだけ表示"
            title={showOnlyFavorites ? "お気に入りだけ表示中" : "お気に入りだけ表示"}
            // スマホはハートだけ．広い画面は横に余裕があるので「お気に入り」の文字も付ける
            className={`btn-icon order-2 border sm:order-3 sm:ml-auto sm:inline-flex sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm ${showOnlyFavorites
              ? "border-accent bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent"
              : "border-line-strong bg-surface"
              }`}
          >
            <Icon name="heart" filled={showOnlyFavorites} className="size-5 sm:size-4" />
            <span className="hidden sm:inline">お気に入り</span>
          </button>
        )}

        <div className="relative order-3 shrink-0 sm:hidden">
          <span className={`btn-icon border bg-surface ${sortKey === "created_at" && sortOrder === "desc" ? "border-line-strong" : "border-ink text-ink"}`}>
            <Icon name="sort" className="size-5" />
          </span>
          <select
            aria-label={`並び替え（${sortLabel}）`}
            value={sortValue}
            onChange={(e) => changeSort(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
          >
            {sortOptions.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* 絞り込みのチップ．スマホでは2段目に，横幅いっぱいで横スクロールにする */}
        <div className="order-4 -mx-4 flex basis-full gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:order-2 sm:mx-0 sm:basis-auto sm:overflow-visible sm:px-0">
          {!publicOnly && (
            <div role="group" aria-label="表示する種類" className="flex shrink-0 gap-1.5">
              {displayTypeOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDisplayType(value)}
                  aria-pressed={displayType === value}
                  className={chipClassName(displayType === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 公開マップへの入口．スマホでは大きなカードの代わりに，チップの並びの最後に置く */}
          {showPublicMapsCard && (
            <Link to="/public-maps" className={`${chipClassName(false)} sm:hidden`}>
              <Icon name="globe" />
              公開マップ
            </Link>
          )}
        </div>

        {/* 並び替え（広い画面）．右端に，今の並び順が読める選択欄を置く */}
        <select
          aria-label="並び替え"
          value={sortValue}
          onChange={(e) => changeSort(e.target.value)}
          className={`field hidden min-h-9 w-auto max-w-full py-0 sm:order-4 sm:block ${currentUser ? "" : "sm:ml-auto"}`}
        >
          {sortOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* 公開マップへの入口（広い画面）．スマホでは上のチップに置いている */}
      {showPublicMapsCard && <PublicMapsCard className="mt-4 hidden sm:flex" />}

      {isEmpty ? (
        <p className="mt-6 text-sm text-sub">
          {trimmedQuery
            ? `「${trimmedQuery}」に一致するものが見つかりません。`
            : showOnlyFavorites
              ? "お気に入りに登録したものはまだありません。"
              : publicOnly
                ? "公開されているマップはまだありません。"
                : "まだ何もありません。右上の「新しいマップ」から作れます。"}
        </p>
      ) : (
        <>
          {visibleFolders.length > 0 && (
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {visibleFolders.map((f) => (
                // 白い枠のどこを押してもフォルダを開く．ハートと「⋮」だけは別のボタンとして反応する．
                // 仕組み：フォルダへのリンクに付けた透明な面（after:）を枠いっぱいに広げ，
                // ボタンだけ relative z-10 でその面より手前に出している（管理画面の一覧と同じ作り）．
                <li
                  key={f.id}
                  className={`relative flex items-center rounded-xl border border-line bg-surface pr-1 transition-colors hover:bg-paper ${openMenu === `folder-${f.id}` ? "z-30" : "z-0"}`}
                >
                  <Link
                    to={`/folders/${f.id}`}
                    className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-3 after:absolute after:inset-0 after:rounded-xl"
                  >
                    <Icon name="folder" className="size-5 text-sub" />
                    <span className="min-w-0 truncate font-medium text-ink">{f.name}</span>
                  </Link>

                  <div className="relative z-10 flex shrink-0 items-center">
                  <FavoriteButton
                    active={f.is_favorited}
                    onClick={(e) => toggleFolderFavorite(e, f.id, f.is_favorited)}
                  />

                  <ThreeDotMenu
                    label={`${f.name}の操作メニューを開く`}
                    isOpen={openMenu === `folder-${f.id}`}
                    onToggle={() =>
                      setOpenMenu((current) =>
                        current === `folder-${f.id}`
                          ? null
                          : `folder-${f.id}`,
                      )
                    }
                    onClose={() => setOpenMenu(null)}
                  >
                    <MenuItem
                      icon={copiedMenu === `folder-${f.id}` ? "check" : "link"}
                      onClick={() => copyItemUrl("folder", f.id)}
                    >
                      {copiedMenu === `folder-${f.id}` ? "コピーしました" : "URLをコピー"}
                    </MenuItem>

                    {currentUser &&
                      (f.user_id === null ||
                        canManageContent(f, currentUser.id, isAdmin)) && (
                        <MenuItem
                          icon="trash"
                          danger
                          disabled={updatingFolder || deletingFolderId !== null}
                          onClick={() => {
                            setOpenMenu(null);
                            handleDeleteFolder(f);
                          }}
                        >
                          削除
                        </MenuItem>
                      )}
                  </ThreeDotMenu>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* スマホでは小さなサムネイルを左に置いた行にして，1画面に並ぶ数を増やす． */}
          {visibleMaps.length > 0 && (
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {visibleMaps.map((map) => (
                <li
                  key={map.id}
                  // フォルダのカードと同じく，白い枠のどこを押してもマップを開く（タイトルのリンクを枠いっぱいに広げている）
                  className={`group relative flex rounded-xl border border-line bg-surface transition-colors hover:bg-paper sm:flex-col ${openMenu === `map-${map.id}` ? "z-30" : "z-0"}`}
                >
                  <Link
                    to={`/maps/${map.id}`}
                    tabIndex={-1}
                    aria-hidden="true"
                    // 角丸はカードの枠（1px）の内側に合わせて，カードの角丸より1px小さくする（同じ値だと角に隙間が見える）．
                    // 角は1つずつ指定する（スマホは左上・左下，広い画面は左上・右上）．rounded-l と rounded-t のように
                    // 2つの角をまとめて指定すると，両方に含まれる左上を後から書かれた方が上書きし，左上だけ角丸が消えてしまう．
                    // isolate：画像のフェードなどで画像が別の描画層になっても，角丸の外側をきちんと切り取らせるため．
                    // 中のサムネイル（画像・読み込み中の面）も rounded-[inherit] で同じ角丸を受け継ぐ．
                    className="isolate block w-24 shrink-0 overflow-hidden rounded-tl-[calc(var(--radius-xl)-1px)] rounded-bl-[calc(var(--radius-xl)-1px)] bg-paper sm:w-full sm:rounded-bl-none sm:rounded-tr-[calc(var(--radius-xl)-1px)]"
                  >
                    {map.image_url ? (
                      <MapThumbnail map={map} />
                    ) : (
                      <div className="grid h-full min-h-20 place-items-center text-faint sm:h-36">
                        <Icon name="map" className="size-6" />
                      </div>
                    )}
                  </Link>

                  {/*
                    カードの本文は2段．
                      1段目：タイトル（1行．長いときは末尾を…で省く）
                      2段目：左に公開範囲のタグと説明（1行），右にお気に入り・保存・メニューのボタン
                    ボタンをタイトルと同じ行に置くと，スマホではタイトルの幅が狭くなり短い名前でも折り返すので，
                    ボタンは下の段にまとめている（通販アプリの商品カードと同じ並べ方）．
                    説明を別の段にすると，説明のあるマップ（公開マップに多い）だけカードが高くなり
                    一覧の高さがそろわないので，説明はタグの横に置いて，どのカードも同じ高さにしている．
                  */}
                  <div className="flex min-w-0 flex-1 flex-col pb-0.5 pl-3 pr-0.5 pt-2.5 sm:pb-0.5 sm:pl-3 sm:pr-0.5 sm:pt-3">
                    <Link to={`/maps/${map.id}`} className="min-w-0 pr-2.5 after:absolute after:inset-0 after:rounded-xl">
                      <h3 className="truncate text-base font-bold leading-6 text-ink group-hover:underline">
                        {map.title}
                      </h3>
                    </Link>

                    <div className="mt-auto flex min-w-0 items-center gap-1 pt-1">
                      <span className={`tag ${map.is_public ? "" : "tag-private"}`}>
                        {getMapVisibilityLabel(map)}
                      </span>

                      {/* 説明はボタンまでの残りの幅に1行で収め，入りきらない分は…で省く */}
                      <p className="min-w-0 flex-1 truncate text-xs text-sub">
                        {map.description}
                      </p>

                      {/*
                        ボタンは右下に詰めて並べる．カードの中では，ボタンの押せる範囲をふだんより一回り小さく
                        （スマホ36px・広い画面32px）して，周りの余白を減らしている．アイコンの大きさは変えない．
                      */}
                      <div className="relative z-10 flex shrink-0 items-center [&_.btn-icon]:size-9 sm:[&_.btn-icon]:size-8">
                          <FavoriteButton
                            active={map.is_favorited}
                            onClick={(e) => toggleFavorite(e, map.id, map.is_favorited)}
                          />

                          {/* 他の人のマップだけ，自分の一覧への保存（ブックマーク）．押すたびに保存と解除が切り替わる */}
                          {currentUser && map.user_id !== currentUser.id && (
                            <SaveToMyListButton
                              itemType="map"
                              itemId={map.id}
                              ownerId={map.user_id}
                              currentUser={currentUser}
                              variant="icon"
                            />
                          )}

                          <ThreeDotMenu
                            label={`${map.title}の操作メニューを開く`}
                            isOpen={openMenu === `map-${map.id}`}
                            onToggle={() =>
                              setOpenMenu((current) =>
                                current === `map-${map.id}`
                                  ? null
                                  : `map-${map.id}`,
                              )
                            }
                            onClose={() => setOpenMenu(null)}
                          >
                            {getMapVisibility(map) !== "private" && <MenuItem
                              icon={copiedMenu === `map-${map.id}` ? "check" : "link"}
                              onClick={() => copyItemUrl("map", map.id)}
                            >
                              {copiedMenu === `map-${map.id}` ? "コピーしました" : "共有URLをコピー"}
                            </MenuItem>}

                            {canManageContent(map, currentUser?.id, isAdmin) && (
                              <MenuItem
                                icon="folder"
                                onClick={() => {
                                  setOpenMenu(null);
                                  startMovingMap(map);
                                }}
                              >
                                フォルダへ移動
                              </MenuItem>
                            )}
                          </ThreeDotMenu>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      </div>
    </div>
  );
}
