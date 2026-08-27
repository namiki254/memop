import { getPinEmoji } from "../lib/pinTypes";
// reactからuseStateをインポート
import { useState } from "react";

/**
 * 地図表示コンポーネント．
 *
 * マップ画像を表示し，その上にピンを重ねる．
 *
 * props:
 *   map        maps テーブルの1行．{ id, title, description, image_url, created_at }
 *   pins       pins テーブルの配列．{ id, map_id, x, y, title, content, pin_type, created_at }
 *   onPinClick ピンがクリックされたときに呼ぶ．引数はそのピン
 *   onMapClick 画像の何もない場所がクリックされたときに呼ぶ．引数は x と y（どちらも0〜1）
 *
 * 座標について：
 *   x と y は「画像に対する割合」．ピクセルではない．
 *   x = 0.35, y = 0.62 なら「画像の左から35%，上から62%の位置」という意味．
 *   こうしておくと，画面や画像の大きさが変わってもピンがずれない．
 */
export function MapView({ map, pins = [], onPinClick, onMapClick }) {
  // 拡大率（scale）、最大拡大率（maxScale）のStateを管理
  const [scale, setScale] = useState(1);
  const [maxScale, setMaxScale] = useState(2); // フォールバック用初期値

  const MIN_SCALE = 1; // 最小表示を1倍に設定
  const SCALE_STEP = 0.25; // 0.25刻みのスケール

  const handleZoomIn = () =>
    setScale((prev) => Math.min(prev + SCALE_STEP, maxScale));
  const handleZoomOut = () =>
    setScale((prev) => Math.max(prev - SCALE_STEP, MIN_SCALE));

  // 画像読み込みのタイミングで、表示サイズ（clientWidth）と元画像サイズ（naturalWidth）からmaxScaleを計算
  const handleImageLoad = (e) => {
    const { naturalWidth, clientWidth } = e.target;
    if (clientWidth > 0) {
      // 表示サイズに対する元画像のサイズ比率を計算（最低でも1.5倍は確保）
      const calculatedMax = Math.max(naturalWidth / clientWidth, 1.5);
      setMaxScale(calculatedMax);
    }
  };

  if (!map?.image_url) {
    return (
      <div className="grid h-full w-full place-items-center bg-slate-200 text-slate-500">
        <div className="text-center">
          <p className="text-lg font-bold">地図画像がありません</p>
          <p className="mt-2 text-sm">
            {map?.title || "未選択"} / ピン {pins.length} 件
          </p>
        </div>
      </div>
    );
  }

  /**
   * クリックされた場所を「画像に対する割合」に直して親へ渡す．
   *
   * クリックの座標は画面全体を基準に届くので，画像の左上の位置を引いてから
   * 画像の表示サイズで割る．割るのは元画像のピクセル数ではなく
   * 「いま画面に表示されているサイズ」なので，拡大縮小しても値は変わらない．
   */
  function handleImageClick(event) {
    if (!onMapClick) return;

    const rect = event.currentTarget.getBoundingClientRect();

    // 画像が読み込めていないと大きさが0になり，割り算の結果が NaN になる．
    // データベースは NaN をそのまま受け付けてしまうので，ここで止める．
    if (rect.width === 0 || rect.height === 0) return;

    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    // 端をクリックしたときに 0〜1 をわずかに外れることがあるので収める
    const clamp = (v) => Math.min(1, Math.max(0, v));
    onMapClick(clamp(x), clamp(y));
  }

  return (
    // 一番外側．relativeを付与してボタンの起点とし、スクロールを受け持つ
    <div className="relative h-full w-full overflow-auto p-4">
      {/* ズームボタン（左上に絶対配置＆クリック透過制御） */}
      {/* <div className="absolute top-4 left-4 z-20 flex gap-1 pointer-events-none"> */}
      <div className="sticky top-2 left-2 z-20 w-fit pointer-events-none">
        <div className="flex gap-1 rounded-md bg-white/90 p-1 shadow backdrop-blur-sm pointer-events-auto">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= MIN_SCALE}
            className="h-8 w-8 rounded font-bold hover:bg-slate-100 disabled:opacity-30"
            title="縮小"
          >
            －
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= maxScale}
            className="h-8 w-8 rounded font-bold hover:bg-slate-100 disabled:opacity-30"
            title="拡大"
          >
            ＋
          </button>
        </div>
      </div>

      {/* 
        ピンと画像を包む箱．
        widthを直接パーセント制御することで、ピンのズレを防ぎつつ
        スクロールコンテナが領域拡大を正常検知できるようにする
      */}
      <div
        className="relative mx-auto h-fit w-fit leading-none transition-all duration-150"
        style={{ width: `${scale * 100}%` }}
      >
        <img
          src={map.image_url}
          alt={map.title || "マップ画像"}
          onClick={handleImageClick}
          onLoad={handleImageLoad}
          className={`block w-full h-auto object-contain ${onMapClick ? "cursor-crosshair" : ""
            }`}
        />

        {/* ピン群 */}
        {pins.map((pin) => (
          <button
            key={pin.id}
            type="button"
            onClick={() => onPinClick?.(pin)}
            style={{
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
            }}
            className="absolute -translate-x-1/2 -translate-y-full transition-transform hover:scale-125 focus:outline-none"
            title={pin.title}
          >
            <span className="text-2xl drop-shadow">
              {getPinEmoji(pin.pin_type)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}