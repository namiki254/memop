import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import Loading from "../components/Loading";
import ErrorMessage from "../components/ErrorMessage";
import { MapView } from "../components/MapView";
import { PinPanel } from "../components/PinPanel";

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

  // マップ自体（タイトル・説明）の編集
  const [isEditingMap, setIsEditingMap] = useState(false);
  const [mapTitle, setMapTitle] = useState("");
  const [mapDescription, setMapDescription] = useState("");
  const [savingMap, setSavingMap] = useState(false);
  const [mapError, setMapError] = useState("");

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

  /** 画像の何もない場所がクリックされた．そこに新しいピンを作る準備をする */
  function handleMapClick(x, y) {
    setPinError("");
    setSelectedPin({ x, y });
  }

  /** 既にあるピンがクリックされた．中身を表示する */
  function handlePinClick(pin) {
    setPinError("");
    setSelectedPin(pin);
  }

  function closePanel() {
    setSelectedPin(null);
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

  /** マップを削除する（pinsはon delete cascadeで一緒に消える） */
  async function handleDeleteMap() {
    if (savingMap) return;

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
  async function handleSavePin({ title, content, pinType }) {
    if (savingPin || !selectedPin) return;

    setSavingPin(true);
    setPinError("");

    try {
      const { data: created, error: insertError } = await supabase
        .from("pins")
        .insert({
          map_id: id,
          x: selectedPin.x,
          y: selectedPin.y,
          title,
          content,
          pin_type: pinType,
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
      setPins((current) => [...current, created]);
      setSelectedPin(null);
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
      const { data: updated, error: updateError } = await supabase
        .from("pins")
        .update({
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
      setSelectedPin(null);
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

    // 通信の前に確認ダイアログを出す
    if (!window.confirm("このピンを削除しますか？")) {
      return;
    }

    setSavingPin(true);
    setPinError("");

    try {
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
      setSelectedPin(null);
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
                <button
                  onClick={handleDeleteMap}
                  disabled={savingMap}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  削除
                </button>
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
            <p className="mt-1 text-xs text-slate-400">
              画像をクリックするとピンを立てられます．
            </p>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <MapView
          map={map}
          pins={pins}
          onPinClick={handlePinClick}
          onMapClick={handleMapClick}
        />
      </div>

      {selectedPin && (
        <PinPanel
          pin={selectedPin}
          saving={savingPin}
          error={pinError}
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
