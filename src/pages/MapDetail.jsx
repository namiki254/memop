import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { MapView } from "../components/MapView";
import { PinPanel } from "../components/PinPanel";
import { PIN_TYPES } from "../lib/pinTypes";
import { normalizeSearchText } from "../lib/searchText";
import SaveToMyListButton from "../components/SaveToMyListButton";
import ThreeDotMenu, {
  MenuItem,
} from "../components/ThreeDotMenu";

const MAP_BUTTON_FILTER = "kind:button";

/**
 * マップ詳細ページ．
 *
 * URL: /maps/:id
 *
 * URLのIDからマップとピンを取得して表示し，
 * 画像をクリックすると新しいピンを作れるようにする．
 */

export default function MapDetail() {
  // /maps/:id の :id を取得する
  const { id } = useParams();
  const navigate = useNavigate();
  // Supabaseから取得したデータを保存する
  const [map, setMap] = useState(null);
  // マップが入っているフォルダの階層を保存する
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [pins, setPins] = useState([]);
  // 現在ログインしているユーザーを保存する
  const [currentUser, setCurrentUser] = useState(null);
  // 画面の状態
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // パネルに出しているピン．
  // 既存のピンを見ているときは pins の1件，新しく作るときは { x, y } だけの仮の値．
  // null のときはパネルを出さない．
  const [selectedPin, setSelectedPin] = useState(null);

  const [pendingPinAppearance, setPendingPinAppearance] = useState({
    kind: "pin",
    pin_type: PIN_TYPES[0].value,
  });

  const [savingPin, setSavingPin] = useState(false);
  const [pinError, setPinError] = useState("");

  // コピー状態を覚える
  const [copied, setCopied] = useState(false);
  const [mapMenuOpen, setMapMenuOpen] = useState(false);

  // ピンのタイトル検索
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // 同じフォルダに入っている他のマップ（#65のフォルダ機能が前提）．
  // フォルダに入っていないマップ（folder_id が null）では空のまま．
  const [siblingMaps, setSiblingMaps] = useState([]);
  const [siblingMapsOpen, setSiblingMapsOpen] = useState(false);

  // ボタン種類のピン（#67）の移動先として選べる，全マップの一覧．
  const [allMaps, setAllMaps] = useState([]);
  // 今ログインしている人が，このマップの作成者かどうか（削除の許可判定に使う）
  const isMapOwner = currentUser?.id === map?.user_id;
  const isUnownedMap = map?.user_id === null;

  // 持ち主なしマップは誰でも編集できる仕様だが，未ログインの匿名ユーザーには許可しない．
  const canEditMap =
    isMapOwner || (isUnownedMap && Boolean(currentUser));

  // ピンの編集・削除ができるか（持ち主なしピンはログイン済みなら誰でも）．
  // userId は呼び出し側で supabase.auth.getUser() から取り直した最新の値を渡す．
  function canEditPin(pin, userId) {
    if (!pin) return false;
    if (pin.user_id === null) return Boolean(userId);
    return userId === pin.user_id;
  }

  // マップ自体（タイトル・説明）の編集
  const [isEditingMap, setIsEditingMap] = useState(false);
  const [mapTitle, setMapTitle] = useState("");
  const [mapDescription, setMapDescription] = useState("");
  const [mapIsPublic, setMapIsPublic] = useState(true); // 追加
  const [savingMap, setSavingMap] = useState(false);
  const [mapError, setMapError] = useState("");



  //PIN_TIPESからvalueだけを取り出す
  const fixedTypeValues = new Set(
    PIN_TYPES.map((type) => type.value)
  );

  //自由入力されたピンのみ取り出す
  const customTypeValues = [
    ...new Set(
      pins
        .filter((pin) => pin.kind !== "button")
        .map((pin) => pin.pin_type)
        .filter(
          (pinType) =>
            pinType && !fixedTypeValues.has(pinType)
        )
    ),
  ];

  //表示種類一覧
  const availablePinTypes = [
    {
      value: MAP_BUTTON_FILTER,
      label: "マップ移動",
      emoji: "🚪",
    },
    ...PIN_TYPES,
    ...customTypeValues.map((value) => ({
      value,
      label: value,
      isCustom: true,
    })),
  ];

  // 表示するピンの種類を管理する
  const [defaultTypeVisible, setDefaultTypeVisible] =
    useState(true);

  const [typeVisibility, setTypeVisibility] =
    useState({});
  //その種類が表示対象か調べる
  function isTypeEnabled(typeId) {
    return (
      typeVisibility[typeId] ??
      defaultTypeVisible
    );
  }

  //ピンを動かせるように
  const [isEditingPin, setIsEditingPin] = useState(false);
  function handleMovePin(x, y) {
    if (!isEditingPin) return;

    setSelectedPin((pin) => {
      if (!pin) return pin;

      // 座標が変わっていなければ再レンダーしない
      if (pin.x === x && pin.y === y) {
        return pin;
      }

      return {
        ...pin,
        x,
        y,
      };
    });
  }

  function startEditingPin() {
    if (!selectedPin?.id) return;

    setPinError("");
    setIsEditingPin(true);
  }

  function cancelEditingPin() {
    const originalPin = pins.find(
      (pin) => pin.id === selectedPin?.id
    );

    if (originalPin) {
      setSelectedPin(originalPin);
    }

    setPinError("");
    setIsEditingPin(false);
  }

  // ピンの表示・非表示を切り替えるhandle
  function handleTypeToggle(typeId) {
    setTypeVisibility((prev) => {
      const currentlyEnabled =
        prev[typeId] ?? defaultTypeVisible;

      return {
        ...prev,
        [typeId]: !currentlyEnabled,
      };
    });
  }
  // 全選択
  function handleSelectAll() {
    setDefaultTypeVisible(true);
    setTypeVisibility({});
  }
  // 全解除
  function handleDeselectAll() {
    setDefaultTypeVisible(false);
    setTypeVisibility({});
  }

  // 表示対象のピンに絞り込む（種類フィルタ × タイトル検索のAND条件）．
  // ただし今まさに編集中のピンは，フィルタに一致しなくなっても地図上から消さない
  // （フィルタ変更でドラッグ対象が消えて操作できなくなるのを防ぐ）．
  const visiblePins = pins.filter((pin) => {
    // 編集中のピンは、フィルターに関係なく表示し続ける
    if (isEditingPin && pin.id === selectedPin?.id) {
      return true;
    }

    const displayType =
      pin.kind === "button"
        ? MAP_BUTTON_FILTER
        : pin?.pin_type || PIN_TYPES[0].value;

    const isTypeMatch = isTypeEnabled(displayType);

    const isTitleMatch = normalizeSearchText(pin?.title).includes(
      normalizeSearchText(searchQuery.trim()),
    );

    return isTypeMatch && isTitleMatch;
  });
  const displayPins = visiblePins.map((pin) =>
    isEditingPin && pin.id === selectedPin?.id
      ? {
        ...selectedPin,
        ...pendingPinAppearance,
      }
      : pin
  );
  // マップとピンを取得する
  const loadMapDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMap(null);
    setPins([]);
    setSelectedPin(null);
    setPinError("");
    setIsEditingPin(false);
    setSearchQuery("");
    setIsEditingMap(false);
    setMapError("");

    try {
      // 1. mapsテーブルから、URLのIDに一致するマップを取得
      const { data: mapData, error: mapError } = await supabase
        .from("maps")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      // 22P02 はIDの形式が不正なときのエラー．
      // /maps/abc123 のようにUUIDでない文字列が入ると起きるので，
      // 「見つからなかった」と同じ扱いにする．
      if (mapError?.code === "22P02") {
        return;
      }

      if (mapError) {
        throw mapError;
      }

      // 該当するマップが存在しない場合
      if (!mapData) {
        return;
      }

      // マップがフォルダに入っている場合、親フォルダを順番にたどる
      const crumbs = [];
      let cursor = mapData.folder_id;

      while (cursor) {
        const { data: folderData, error: folderError } = await supabase
          .from("folders")
          .select("id, name, parent_folder_id")
          .eq("id", cursor)
          .maybeSingle();

        if (folderError) {
          throw folderError;
        }

        if (!folderData) {
          break;
        }

        crumbs.unshift(folderData);
        cursor = folderData.parent_folder_id;
      }

      setBreadcrumb(crumbs);

      // 2. pinsテーブルから、そのマップのピンを取得
      const { data: pinData, error: pinError } = await supabase
        .from("pins")
        .select("*")
        .eq("map_id", id)
        .order("created_at", { ascending: true });

      if (pinError) {
        throw pinError;
      }

      // 3. 取得したデータをstateへ保存
      setMap(mapData);
      setMapTitle(mapData.title);
      setMapDescription(mapData.description ?? "");
      setMapIsPublic(mapData.is_public ?? true); // 追加
      setPins(pinData ?? []);
    } catch (fetchError) {
      setError(fetchError);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMapDetail();
  }, [loadMapDetail]);

  // パネルが閉じたら（他の人の削除で自動的に閉じた場合も含む），
  // 編集モード・エラー表示を残さないようにする．
  useEffect(() => {
    if (!selectedPin) {
      setIsEditingPin(false);
      setPinError("");
    }
  }, [selectedPin]);

  // 同じフォルダの他マップを取る．
  // 依存を map?.folder_id（値）にしているので，同じフォルダ内で
  // マップを切り替えても（id は変わるが folder_id は変わらない）取り直さない．
  useEffect(() => {
    if (!map?.folder_id) {
      setSiblingMaps([]);
      return;
    }

    let ignore = false;

    async function loadSiblings() {
      const { data, error: siblingsError } = await supabase
        .from("maps")
        .select("id, title, is_public, user_id")   // is_public, user_idも取得
        .eq("folder_id", map.folder_id)
        .order("created_at", { ascending: true });

      if (!ignore && !siblingsError) {
        setSiblingMaps(data ?? []);
      }
    }

    loadSiblings();
    return () => {
      ignore = true;
    };
  }, [map?.folder_id]);

  // ボタンの移動先ピッカーに使う，全マップの一覧．最初に1回だけ取る．
  useEffect(() => {
    async function loadAllMaps() {
      const { data, error: allMapsError } = await supabase
        .from("maps")
        .select("id, title")
        .eq("is_public", true)   // is_publicがtrueのものだけを選択肢として取得
        .order("title");

      if (!allMapsError) {
        setAllMaps(data ?? []);
      }
    }

    loadAllMaps();
  }, []);

  // 現在ログインしているユーザーを取得する
  useEffect(() => {
    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUser(user);
    }


    loadCurrentUser();

    //ログイン状態の監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const newUser = newSession?.user ?? null;
      setCurrentUser(newUser);

      // ログアウト時の処理
      if (!newUser) {
        setSelectedPin(null);
        setIsEditingPin(false);

        // 非公開マップを閲覧中だった場合、画面を非表示にする
        setMap((currentMap) => {
          if (currentMap && !currentMap.is_public) {
            // リダイレクトせず「マップが見つかりません」画面にする
            return null;
          }
          return currentMap;
        });
      }
    });

    //ページを離れたら監視を中止
    return () => {
      subscription.unsubscribe();
    };

  }, []);



  // 他の人が置いた・書き直した・消したピンを，リロードなしで反映する．
  //
  // Supabase側で pins テーブルの変更配信（Replication）を有効にしておかないと，
  // ここは何も受け取れない（#39のヒント参照）．
  useEffect(() => {
    const channel = supabase
      .channel(`pins-of-map-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pins", filter: `map_id=eq.${id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            // 自分が置いたピンは，保存時にすでに手元へ足してある．
            // 同じ id が来たら足さないことで，二重表示を防ぐ．
            setPins((current) =>
              current.some((p) => p.id === payload.new.id)
                ? current
                : [...current, payload.new],
            );
          } else if (payload.eventType === "UPDATE") {
            setPins((current) =>
              current.map((p) => (p.id === payload.new.id ? payload.new : p)),
            );
          } else if (payload.eventType === "DELETE") {
            setPins((current) => current.filter((p) => p.id !== payload.old.id));
            // 今開いている・編集中のピンが他の人に消された場合，
            // 存在しないピンをパネルに表示し続けないようにする．
            setSelectedPin((current) =>
              current?.id === payload.old.id ? null : current,
            );
          }
        },
      )
      .subscribe();

    // ページを離れる・別のマップに移るときは，必ず接続を切る．
    // 切らないと，開くたびに接続が増え続ける．
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  /** 画像の何もない場所がクリックされた．そこに新しいピンを作る準備をする */
  async function handleMapClick(x, y) {
    setPinError("");

    // 現在ログインしているユーザーを確認する
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("ピンを作成するにはログインしてください");
      return;
    }
    setSelectedPin({ x, y });
  }

  /** ピンをクリックしたら詳細パネルを開く */
  function handlePinClick(pin) {
    setPinError("");
    setIsEditingPin(false);
    setSelectedPin(pin);
  }


  /** マップ移動ボタンをダブルクリックしたら直接移動する */
  async function handlePinDoubleClick(pin) {
    if (pin.kind !== "button") return;

    await handleNavigateToMap(pin.link_map_id);
  }

  /** パネルの移動ボタンから移動する */
  async function handleNavigateToMap(linkMapId) {
    setPinError("");

    if (!linkMapId) {
      setPinError("移動先のマップが設定されていません．");
      return;
    }

    const { data: targetMap, error: targetMapError } = await supabase
      .from("maps")
      .select("id, is_public")
      .eq("id", linkMapId)
      .maybeSingle();

    if (
      targetMapError ||
      !targetMap ||
      !targetMap.is_public
    ) {
      setPinError(
        "移動先のマップが存在しないか、非公開に変更されたため移動できません．",
      );
      return;
    }

    navigate(`/maps/${linkMapId}`);
  }

  function closePanel() {
    setSelectedPin(null);
    setIsEditingPin(false);
    setPinError("");
  }

  // コピー処理を追加
  // utrをクリップボードにコピー、2秒経ったらもとに戻す（Issueのコード通り）
  async function copyUrl() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startEditingMap() {
    setMapError("");
    setIsEditingMap(true);
  }

  function cancelEditingMap() {
    setMapTitle(map.title);
    setMapDescription(map.description ?? "");
    setMapIsPublic(map.is_public ?? true); // 追加
    setMapError("");
    setIsEditingMap(false);
  }

  /** マップのタイトル・説明を書き直す */
  async function handleUpdateMap(event) {
    event.preventDefault();
    if (savingMap) return;
    if (!canEditMap) {
      setMapError("マップを編集できるのは作成者だけです．");
      return;
    }
    const trimmedTitle = mapTitle.trim();
    if (!trimmedTitle) return;

    setSavingMap(true);
    setMapError("");

    try {
      // RLSに加えて，クライアント側でも所有者条件を絞り込んでおく（多層防御）．
      let updateQuery = supabase
        .from("maps")
        .update({
          title: trimmedTitle,
          description: mapDescription.trim(),
          is_public: mapIsPublic,   // 追加
        })
        .eq("id", id);
      updateQuery = isUnownedMap
        ? updateQuery.is("user_id", null)
        : updateQuery.eq("user_id", currentUser.id);

      const { data: updated, error: updateError } = await updateQuery
        .select()
        .single();

      if (updateError) {
        console.error("マップの更新に失敗", updateError);
        setMapError(`更新に失敗しました．${updateError.message}`);
        return;
      }

      setMap(updated);
      setMapTitle(updated.title);
      setMapDescription(updated.description ?? "");
      setIsEditingMap(false);
    } catch (e) {
      console.error("マップの更新中に予期しないエラー", e);
      setMapError(`予期しないエラーが発生しました．${e?.message ?? e}`);
    } finally {
      setSavingMap(false);
    }
  }

  /** マップを削除する（pinsはon delete cascadeで一緒に消える）．作成者だけが実行できる． */
  async function handleDeleteMap() {
    if (savingMap) return;

    if (!canEditMap) {
      setMapError("マップを削除できるのは作成者だけです．");
      return;
    }

    if (
      !window.confirm(
        "このマップを削除しますか？中のピンもすべて削除され，元に戻せません．",
      )
    ) {
      return;
    }

    setSavingMap(true);
    setMapError("");

    try {
      // RLSに加えて，クライアント側でも所有者条件を絞り込んでおく（多層防御）．
      let deleteQuery = supabase.from("maps").delete().eq("id", id);
      deleteQuery = isUnownedMap
        ? deleteQuery.is("user_id", null)
        : deleteQuery.eq("user_id", currentUser.id);

      const { error: deleteError } = await deleteQuery;

      if (deleteError) {
        console.error("マップの削除に失敗", deleteError);
        setMapError(`削除に失敗しました．${deleteError.message}`);
        return;
      }

      navigate("/", { replace: true });
    } catch (e) {
      console.error("マップの削除中に予期しないエラー", e);
      setMapError(`予期しないエラーが発生しました．${e?.message ?? e}`);
    } finally {
      setSavingMap(false);
    }
  }

  /** パネルの入力を pins テーブルに保存する */
  async function handleSavePin({ title, content, pinType, kind, linkMapId }) {
    if (savingPin || !selectedPin) return;

    setSavingPin(true);
    setPinError("");

    try {
      // 現在ログインしているユーザーを取得する
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setPinError("ピンを作成するにはログインしてください．");
        return;
      }
      const { data: created, error: insertError } = await supabase
        .from("pins")
        .insert({
          map_id: id,
          x: selectedPin.x,
          y: selectedPin.y,
          title,
          content,
          pin_type: pinType,
          kind,
          link_map_id: kind === "button" ? linkMapId : null,
          user_id: user.id,
        })
        .select()
        .single();

      if (insertError) {
        console.error("ピンの保存に失敗", insertError);
        setPinError(`保存に失敗しました．${insertError.message}`);
        return;
      }

      // 作られたピンを手元の一覧に足す．
      // ここで loadMapDetail() を呼び直すと，画面が一度「読み込み中...」に戻って
      // 地図が消えるので，ピンを1件足すだけのときは呼ばない．
      setPins((current) =>
        current.some((p) => p.id === created.id)
          ? current
          : [...current, created],
      );
      closePanel();
    } catch (e) {
      console.error("ピンの保存中に予期しないエラー", e);
      setPinError(`予期しないエラーが発生しました．${e?.message ?? e}`);
    } finally {
      setSavingPin(false);
    }
  }

  /** パネルで編集した内容を更新する */
  async function handleUpdatePin({ title, content, pinType, kind, linkMapId }) {
    if (savingPin || !selectedPin) return;

    setSavingPin(true);
    setPinError("");

    try {
      // 現在ログインしているユーザーを取得する
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user || !canEditPin(selectedPin, user.id)) {
        setPinError("このピンは編集できません．");
        return;
      }

      // RLSに加えて，クライアント側でも所有者条件を絞り込んでおく（多層防御）．
      let updatePinQuery = supabase
        .from("pins")
        .update({
          x: selectedPin.x,
          y: selectedPin.y,
          title,
          content,
          pin_type: pinType,
          kind,
          link_map_id: kind === "button" ? linkMapId : null,
        })
        .eq("id", selectedPin.id);
      updatePinQuery =
        selectedPin.user_id === null
          ? updatePinQuery.is("user_id", null)
          : updatePinQuery.eq("user_id", user.id);

      const { data: updated, error: updateError } = await updatePinQuery
        .select()
        .single();

      if (updateError) {
        console.error("ピンの更新に失敗", updateError);
        setPinError(`更新に失敗しました．${updateError.message}`);
        return;
      }

      // 手元の配列を書き換えて画面に即時反映
      setPins((current) =>
        current.map((p) => (p.id === updated.id ? updated : p))
      );
      closePanel();
    } catch (e) {
      console.error("ピンの更新中に予期しないエラー", e);
      setPinError(`予期しないエラーが発生しました．${e?.message ?? e}`);
    } finally {
      setSavingPin(false);
    }
  }

  /** ピンを削除する */
  async function handleDeletePin() {
    if (savingPin || !selectedPin) return;

    setSavingPin(true);
    setPinError("");

    try {
      // 現在ログインしているユーザーを取得する
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user || !canEditPin(selectedPin, user.id)) {
        setPinError("このピンは削除できません．");
        return;
      }

      // 本人であることを確認してから削除確認を出す
      if (!window.confirm("このピンを削除しますか？")) {
        return;
      }

      // RLSに加えて，クライアント側でも所有者条件を絞り込んでおく（多層防御）．
      let deletePinQuery = supabase.from("pins").delete().eq("id", selectedPin.id);
      deletePinQuery =
        selectedPin.user_id === null
          ? deletePinQuery.is("user_id", null)
          : deletePinQuery.eq("user_id", user.id);

      const { error: deleteError } = await deletePinQuery;

      if (deleteError) {
        console.error("ピンの削除に失敗", deleteError);
        setPinError(`削除に失敗しました．${deleteError.message}`);
        return;
      }

      // 手元の配列から対象のピンを除外
      setPins((current) => current.filter((p) => p.id !== selectedPin.id));
      closePanel();
    } catch (e) {
      console.error("ピンの削除中に予期しないエラー", e);
      setPinError(`予期しないエラーが発生しました．${e?.message ?? e}`);
    } finally {
      setSavingPin(false);
    }
  }

  // 1. 読み込み中は Loading コンポーネントを表示
  if (loading) {
    return <Loading />;
  }

  // 2. エラー時は ErrorMessage コンポーネントを表示（error.messageを渡す）
  if (error) {
    return <ErrorMessage message={error.message} />;
  }

  // URLのIDに一致するマップがなかった場合
  if (!map) {
    return (
      <div className="grid h-full place-items-center p-8 text-slate-600">
        <p className="text-lg font-semibold">マップが見つかりません</p>
      </div>
    );
  }

  const backHref = map.folder_id
    ? `/folders/${map.folder_id}`
    : "/";

  const backLabel = map.folder_id
    ? "フォルダに戻る"
    : "マップ一覧に戻る";

  // 他人の非公開マップを除外したフォルダ内マップ一覧
  const visibleSiblingMaps = siblingMaps.filter(
    (sibling) => sibling.is_public || sibling.user_id === currentUser?.id,
  );

  return (

    <div className="relative flex h-full min-w-0 bg-rose-100">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="border-b border-rose-200 bg-white px-3 py-2 sm:px-4">
          <Link
            to={backHref}
            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline"
          >
            <span aria-hidden="true">←</span>
            {backLabel}
          </Link>

          {/* パンくずリスト */}
          <p className="mb-1 truncate whitespace-nowrap text-xs text-slate-500">
            <Link to="/" className="hover:underline">
              ホーム
            </Link>

            {breadcrumb.map((folder) => (
              <span key={folder.id}>
                {" / "}
                <Link
                  to={`/folders/${folder.id}`}
                  className="hover:underline"
                >
                  {folder.name}
                </Link>
              </span>
            ))}

            {" / "}
            <span>{map.title}</span>
          </p>
          {isEditingMap ? (
            <form onSubmit={handleUpdateMap}>
              <input
                type="text"
                value={mapTitle}
                onChange={(e) => setMapTitle(e.target.value)}
                disabled={savingMap}
                maxLength={100}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-lg font-bold disabled:bg-slate-100"
              />
              <textarea
                value={mapDescription}
                onChange={(e) => setMapDescription(e.target.value)}
                disabled={savingMap}
                maxLength={500}
                rows={2}
                placeholder="説明（任意）"
                className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />

              {/* 公開/非公開の切替 */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  id="editIsPublic"
                  type="checkbox"
                  checked={mapIsPublic}
                  onChange={(e) => setMapIsPublic(e.target.checked)}
                  disabled={savingMap}
                  className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                />
                <label htmlFor="editIsPublic" className="text-xs font-medium text-slate-700 cursor-pointer">
                  このマップを公開する（{mapIsPublic ? "URLを知っている人は誰でも閲覧可" : "自分のみ閲覧可"}）
                </label>
              </div>

              {mapError && (
                <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
                  {mapError}
                </p>
              )}

              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={savingMap || mapTitle.trim() === ""}
                  className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {savingMap ? "保存中..." : "保存"}
                </button>
                <button
                  type="button"
                  onClick={cancelEditingMap}
                  disabled={savingMap}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50"
                >
                  キャンセル
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* タイトルとボタン類を横並びにするためにflexを使用 */}
              <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex w-full min-w-0 flex-wrap items-center gap-1 sm:w-auto sm:flex-1">
                  <h2 className="min-w-0 break-words text-lg font-bold text-slate-800">
                    {map.title}
                  </h2>

                  {/* 公開/非公開バッジ */}
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${map.is_public
                      ? "bg-slate-100 text-slate-700"
                      : "bg-amber-100 text-amber-800"
                      }`}
                  >
                    {map.is_public ? "公開" : "非公開"}
                  </span>
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                  <SaveToMyListButton
                    itemType="map"
                    itemId={map.id}
                    ownerId={map.user_id}
                    currentUser={currentUser}
                  />
                  {/* コピー成功時に左側にメッセージを表示 */}
                  {copied && (
                    <span className="text-xs font-medium text-emerald-600">
                      コピーしました
                    </span>
                  )}

                  <ThreeDotMenu
                    label={`${map.title}の操作メニューを開く`}
                    isOpen={mapMenuOpen}
                    onToggle={() => setMapMenuOpen((current) => !current)}
                    onClose={() => setMapMenuOpen(false)}
                  >
                    <MenuItem onClick={copyUrl}>
                      {copied ? "✓ コピーしました" : "🔗 URLをコピー"}
                    </MenuItem>

                    {canEditMap && (
                      <MenuItem
                        onClick={() => {
                          setMapMenuOpen(false);
                          startEditingMap();
                        }}
                      >
                        編集
                      </MenuItem>
                    )}

                    {canEditMap && (
                      <MenuItem
                        danger
                        disabled={savingMap}
                        onClick={() => {
                          setMapMenuOpen(false);
                          handleDeleteMap();
                        }}
                      >
                        削除
                      </MenuItem>
                    )}
                  </ThreeDotMenu>


                  {visibleSiblingMaps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSiblingMapsOpen((current) => !current)}
                      aria-expanded={siblingMapsOpen}
                      className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {siblingMapsOpen
                        ? "フォルダ内マップを閉じる"
                        : `フォルダ内マップ（${visibleSiblingMaps.length}）`}
                    </button>
                  )}



                </div>
              </div>

              {map.description && (
                <p className="mt-1 text-sm text-slate-500">{map.description}</p>
              )}
              {mapError && (
                <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
                  {mapError}
                </p>
              )}
            </>
          )}

          {/* ピンの種類ごとの表示・非表示の切替，タイトル検索 */}

        </div>

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="absolute left-3 top-3 z-30">
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
              aria-controls="map-filters"
              className="
        flex items-center justify-between
        rounded-md border border-slate-200
        bg-white/95
        px-3 py-2
        text-xs font-medium text-slate-700
        shadow-md backdrop-blur
        hover:bg-slate-50
      "
            >
              <span>検索・表示フィルタ</span>
              <span aria-hidden="true" className="ml-3">
                {filtersOpen ? "▲" : "▼"}
              </span>
            </button>

            {filtersOpen && (
              <div
                id="map-filters"
                className="
          mt-2
          max-h-[70vh]
          w-72
          max-w-[calc(100vw-1.5rem)]
          space-y-4
          overflow-y-auto
          rounded-lg
          border border-slate-200
          bg-white
          p-3
          shadow-xl
        "
              >
                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600">
                    タイトル検索
                  </span>

                  <input
                    type="text"
                    placeholder="ピンを検索..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      表示フィルタ
                    </span>

                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      すべてオン
                    </button>

                    <span className="text-xs text-slate-300">|</span>

                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      すべてオフ
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {availablePinTypes.map((type) => (
                      <label
                        key={type.value}
                        className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={isTypeEnabled(type.value)}
                          onChange={() => handleTypeToggle(type.value)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />

                        <span className="max-w-[8rem] truncate">
                          {type.isCustom
                            ? type.label
                            : `${type.emoji}: ${type.label}`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <MapView
            // マップを切り替えたときにズーム倍率(scale)をリセットするため，
            // マップごとに別インスタンスとして作り直す．
            key={map.id}
            map={map}
            pins={displayPins}
            pendingPin={
              selectedPin && !selectedPin.id
                ? { ...selectedPin, ...pendingPinAppearance }
                : null
            }
            onPinClick={handlePinClick}
            onPinDoubleClick={handlePinDoubleClick}
            onMapClick={isEditingPin ? undefined : handleMapClick}
            movablePinId={isEditingPin ? selectedPin?.id : null}
            onPinMove={handleMovePin}
          />
        </div>

        {selectedPin && (
          <PinPanel
            pin={selectedPin}
            currentUser={currentUser}
            saving={savingPin}
            error={pinError}
            mapOptions={allMaps.filter((m) => m.id !== id)}
            onSave={handleSavePin}
            onClose={closePanel}
            onNavigate={handleNavigateToMap}
            onUpdate={handleUpdatePin}
            onDelete={handleDeletePin}
            onPreviewChange={setPendingPinAppearance}
            isEditing={isEditingPin}
            onEditStart={startEditingPin}
            onEditCancel={cancelEditingPin}
          />
        )}
      </div>
      {/* 同じフォルダの他マップへの切り替え．フォルダに入っていないマップでは出さない．
          他人の非公開マップは visibleSiblingMaps の時点で除外済み． */}
      {siblingMapsOpen && visibleSiblingMaps.length > 0 && (
        <>
          {/* スマホでは一覧の後ろを暗くする */}
          <button
            type="button"
            aria-label="フォルダ内マップの一覧を閉じる"
            onClick={() => setSiblingMapsOpen(false)}
            className="absolute inset-0 z-20 bg-transparent sm:hidden"
          />

          <aside
            className="
        absolute inset-y-0 right-0 z-30
        w-64 overflow-auto
        border-l border-slate-200
        bg-white p-3
        shadow-xl

        sm:static
        sm:w-48
        sm:shrink-0
        sm:shadow-none
      "
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-400">
                同じフォルダのマップ
              </p>

              <button
                type="button"
                onClick={() => setSiblingMapsOpen(false)}
                className="shrink-0 text-xs text-slate-500 underline"
              >
                閉じる
              </button>
            </div>

            <ul className="mt-2 space-y-1">
              {visibleSiblingMaps.map((sibling) => {
                const isActive = sibling.id === map.id;

                return (
                  <li key={sibling.id}>
                    <Link
                      to={`/maps/${sibling.id}`}
                      className={`flex items-center justify-between gap-1 rounded px-2 py-1.5 text-sm ${isActive
                        ? "bg-slate-800 text-white"
                        : "text-slate-700 hover:bg-slate-100"
                        }`}
                    >
                      <span className="truncate">{sibling.title}</span>

                      {/* 公開/非公開バッジ */}
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${isActive
                          ? sibling.is_public
                            ? "bg-slate-700 text-slate-200"
                            : "bg-amber-900/60 text-amber-200"
                          : sibling.is_public
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-100 text-amber-800"
                          }`}
                      >
                        {sibling.is_public ? "公開" : "非公開"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>
        </>
      )}
    </div>
  );
}
