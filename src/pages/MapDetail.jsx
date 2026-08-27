import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { MapView } from "../components/MapView";
import { PinPanel } from "../components/PinPanel";
import { PIN_TYPES } from "../lib/pinTypes";

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

  // ピンのタイトル検索
  const [searchQuery, setSearchQuery] = useState("");

  // 同じフォルダに入っている他のマップ（#65のフォルダ機能が前提）．
  // フォルダに入っていないマップ（folder_id が null）では空のまま．
  const [siblingMaps, setSiblingMaps] = useState([]);

  // ボタン種類のピン（#67）の移動先として選べる，全マップの一覧．
  const [allMaps, setAllMaps] = useState([]);
  // 今ログインしている人が，このマップの作成者かどうか（削除の許可判定に使う）
  const isMapOwner = currentUser?.id === map?.user_id;

  // マップ自体（タイトル・説明）の編集
  const [isEditingMap, setIsEditingMap] = useState(false);
  const [mapTitle, setMapTitle] = useState("");
  const [mapDescription, setMapDescription] = useState("");
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
        .map((pin) => pin.pin_type)
        .filter(
          (pinType) =>
            pinType && !fixedTypeValues.has(pinType)
        )
    ),
  ];

  //ピンの列挙
  const availablePinTypes = [
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

  // 表示対象のピンに絞り込む（種類フィルタ × タイトル検索のAND条件）
  const visiblePins = pins.filter((pin) => {
    // 1. ピンの種類による絞り込み
    const pinType = pin?.pin_type || PIN_TYPES[0].value;
    const isTypeMatch = isTypeEnabled(pinType);

    // 2. タイトルによる絞り込み（小文字化してトリム後を判定）
    const title = pin?.title || "";
    const isTitleMatch = title
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());

    // 両方の条件を満たすものだけ表示
    return isTypeMatch && isTitleMatch;
  });
  const displayPins = visiblePins.map((pin) =>
    isEditingPin && pin.id === selectedPin?.id ? selectedPin : pin
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
        .select("id, title")
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
    setCurrentUser(newSession?.user ?? null);

    // 操作中にログアウトした場合はパネルを閉じる
    if (!newSession) {
      setSelectedPin(null);
      setIsEditingPin(false);
    }
  });

  //ページを離れたら監視を中止
  return () => {
    subscription.unsubscribe();
  };

  },[]);
  


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

  /** 既にあるピンがクリックされた．中身を表示する */
  function handlePinClick(pin) {
    // ボタンのピンは，押した瞬間に移動先のマップへ移る（パネルは開かない）．
    // 移動先が消えている（link_map_id が無い）ときだけ，直せるようパネルを開く．
    if (pin.kind === "button") {
      if (pin.link_map_id) {
        navigate(`/maps/${pin.link_map_id}`);
        return;
      }
    }

    setPinError("");
    setIsEditingPin(false);
    setSelectedPin(pin);
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
    setMapError("");
    setIsEditingMap(false);
  }

  /** マップのタイトル・説明を書き直す */
  async function handleUpdateMap(event) {
    event.preventDefault();
    if (savingMap) return;

    const trimmedTitle = mapTitle.trim();
    if (!trimmedTitle) return;

    setSavingMap(true);
    setMapError("");

    try {
      const { data: updated, error: updateError } = await supabase
        .from("maps")
        .update({ title: trimmedTitle, description: mapDescription.trim() })
        .eq("id", id)
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

    if (!isMapOwner) {
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
      const { error: deleteError } = await supabase
        .from("maps")
        .delete()
        .eq("id", id);

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

      if (userError || !user || user.id !== selectedPin.user_id) {
        setPinError("このピンは編集できません．");
        return;
      }

      const { data: updated, error: updateError } = await supabase
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
        .eq("id", selectedPin.id)
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

      if (userError || !user || user.id !== selectedPin.user_id) {
        setPinError("このピンは削除できません．");
        return;
      }

      // 本人であることを確認してから削除確認を出す
      if (!window.confirm("このピンを削除しますか？")) {
        return;
      }
      const { error: deleteError } = await supabase
        .from("pins")
        .delete()
        .eq("id", selectedPin.id);

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

  return (

    <div className="flex h-full">
      <div className="flex h-full flex-1 flex-col">
        <div className="border-b border-slate-200 px-6 py-3">
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-800">{map.title}</h2>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={copyUrl}
                  className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  {copied ? "コピーしました！" : "このマップのURLをコピー"}
                </button>
                <button
                  onClick={startEditingMap}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  編集
                </button>
                {/* マップの削除は作成者だけができる */}
                {isMapOwner && (
                  <button
                    onClick={handleDeleteMap}
                    disabled={savingMap}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    削除
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
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2 mr-2">
              <span className="text-xs font-semibold text-slate-600">
                タイトル検索:
              </span>
              <input
                type="text"
                placeholder="ピンを検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <span className="text-xs font-semibold text-slate-600">
              表示フィルタ:
            </span>

            {/* 一括選択、解除 */}
            <div className="flex items-center gap-1.5 mr-2">
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

            {availablePinTypes.map((type) => (
              <label
                key={type.value}
                className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={isTypeEnabled(type.value)}
                  onChange={() => handleTypeToggle(type.value)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  {type.isCustom
                    ? type.label
                    : `${type.emoji}: ${type.label}`}
                </span>
              </label>
            ))}
          </div>

          <p className="mt-1 text-xs text-slate-400">
            画像をクリックするとピンを立てられます．
          </p>
        </div>

        <div className="min-h-0 flex-1">
          <MapView
            map={map}
            pins={displayPins}
            pendingPin={
              selectedPin && !selectedPin.id
                ? { ...selectedPin, ...pendingPinAppearance }
                : null
            }
            onPinClick={handlePinClick}
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
            onUpdate={handleUpdatePin}
            onDelete={handleDeletePin}
            onPreviewChange={setPendingPinAppearance}
            isEditing={isEditingPin}
            onEditStart={startEditingPin}
            onEditCancel={cancelEditingPin}
          />
        )}
      </div>
      {/* 同じフォルダの他マップへの切り替え．フォルダに入っていないマップでは出さない． */}
      {siblingMaps.length > 0 && (
        <aside className="w-48 shrink-0 overflow-auto border-l border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-400">同じフォルダのマップ</p>
          <ul className="mt-2 space-y-1">
            {siblingMaps.map((sibling) => (
              <li key={sibling.id}>
                <Link
                  to={`/maps/${sibling.id}`}
                  className={`block truncate rounded px-2 py-1.5 text-sm ${
                    sibling.id === map.id
                      ? "bg-slate-800 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {sibling.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
