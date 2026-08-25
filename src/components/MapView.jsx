import { getPinEmoji } from "../lib/pinTypes";

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
    // 一番外側．ここでスクロールを受け持つ
    <div className="h-full w-full overflow-auto p-4">
      {/* 画像が領域より小さいときは中央に寄せる */}
      <div className="flex min-h-full min-w-full items-center justify-center">
        {/*
          ピンを載せる箱．
          w-fit h-fit と leading-none で，箱の大きさを画像とぴったり同じにする．
          ここがずれると，パーセント指定の基準がずれてピンが全部ずれる．
        */}
        <div className="relative h-fit w-fit leading-none">
          <img
            src={map.image_url}
            alt={map.title || "マップ画像"}
            onClick={handleImageClick}
            className={`block max-h-[80vh] max-w-full object-contain ${
              onMapClick ? "cursor-crosshair" : ""
            }`}
          />

          {/*
            ピン．
            -translate-x-1/2 -translate-y-full で，ピンの先端が座標を指すようにずらす．
            これが無いとピンの左上が座標になり，見た目が右下にずれる．
            画像とは兄弟の要素なので，ピンを押しても画像のクリックには繋がらない．
          */}
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
                {pin.kind === "button" ? "🔗" : getPinEmoji(pin.pin_type)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
