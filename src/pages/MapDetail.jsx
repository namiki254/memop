import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
  const [savingPin, setSavingPin] = useState(false);
  const [pinError, setPinError] = useState("");

  // コピー状態を覚える
  const [copied, setCopied] = useState(false);

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

  // 表示対象のピンに絞り込む
  const visiblePins = pins.filter((pin) => {
    const pinType =
      pin?.pin_type || PIN_TYPES[0].value;

    return isTypeEnabled(pinType);
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

  /** パネルの入力を pins テーブルに保存する */
  async function handleSavePin({ title, content, pinType }) {
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
  async function handleUpdatePin({ title, content, pinType }) {
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
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-6 py-3">

        {/* タイトルとコピーボタンを横並びにするためにflexを使用 */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{map.title}</h2>
          {/* コピーボタンを追加 */}
          <button
            onClick={copyUrl}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            {copied ? "コピーしました！" : "このマップのURLをコピー"}
          </button>
        </div>

        {map.description && (
          <p className="mt-1 text-sm text-slate-500">{map.description}</p>
        )}

        {/* ピンの種類ごとの表示・非表示の切替 */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
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
          // pins={pins}
          // visiblepinに変更
          pins={displayPins}
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
          isEditing={isEditingPin}
          onEditStart={startEditingPin}
          onEditCancel={cancelEditingPin}
          onSave={handleSavePin}
          onClose={closePanel}
          // Update, Deleteを追加
          onUpdate={handleUpdatePin}
          onDelete={handleDeletePin}
        />
      )}
    </div>
  );
}
