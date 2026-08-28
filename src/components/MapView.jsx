import { useState, useRef, useEffect } from "react";
import { getPinEmoji } from "../lib/pinTypes";
import { EmojiPin } from "./EmojiPin"

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


export function MapView({ map, pins = [], pendingPin = null, onPinClick, onMapClick, movablePinId, onPinMove, }) {
  // 拡大率（scale）、最大拡大率（maxScale）のStateを管理
  const [scale, setScale] = useState(1);
  const [maxScale, setMaxScale] = useState(2); // フォールバック用初期値

  // 初期（1倍時）の表示サイズと画像のアスペクト比を保持
  const [baseSize, setBaseSize] = useState({
    width: 0,
    height: 0,
    aspectRatio: 1,
  });
  const imgRef = useRef(null);
  const mapAreaRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const dragStartRef = useRef(null);
  const moveFrameRef = useRef(null);
  const pendingMoveRef = useRef(null);

  const MIN_SCALE = 1; // 最小表示を1倍に設定
  const SCALE_STEP = 0.25; // 0.25刻みのスケール

  const handleZoomIn = () =>
    setScale((prev) => Math.min(prev + SCALE_STEP, maxScale));
  const handleZoomOut = () =>
    setScale((prev) => Math.max(prev - SCALE_STEP, MIN_SCALE));

  // 画像読み込みのタイミングで、表示サイズ（clientWidth）と元画像サイズ（naturalWidth）からmaxScaleを計算
  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight, clientWidth, clientHeight } = e.target;
    if (clientWidth > 0 && clientHeight > 0) {
      const aspectRatio = naturalWidth / naturalHeight;
      setBaseSize({ width: clientWidth, height: clientHeight, aspectRatio });

      // 表示サイズに対する元画像のサイズ比率を計算（最低でも2倍は確保）
      const calculatedMax = Math.max(naturalWidth / clientWidth, 2);
      setMaxScale(calculatedMax);
    }
  };

  // ウィンドウサイズ変更時に1倍時の基準サイズを再計算
  useEffect(() => {
    const handleResize = () => {
      if (imgRef.current && scale === 1) {
        setBaseSize((prev) => ({
          ...prev,
          width: imgRef.current.clientWidth,
          height: imgRef.current.clientHeight,
        }));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scale]);

  useEffect(() => {
    return () => {
      if (moveFrameRef.current !== null) {
        cancelAnimationFrame(moveFrameRef.current);
      }
    };
  }, []);

  // 右クリックドラッグ中のマウス移動を画面全体で監視する
  useEffect(() => {
    function handleMouseMove(event) {
      if (!dragStartRef.current) return;
      if (!scrollAreaRef.current) return;

      const deltaX = event.clientX - dragStartRef.current.x;
      const deltaY = event.clientY - dragStartRef.current.y;

      scrollAreaRef.current.scrollLeft =
        dragStartRef.current.scrollLeft - deltaX;

      scrollAreaRef.current.scrollTop =
        dragStartRef.current.scrollTop - deltaY;
    }

    function handleMouseUp(event) {
      if (event.button !== 2) return;

      dragStartRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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

  // 右クリックドラッグ開始時の位置を保存
  function handleMapMouseDown(event) {
    if (event.button !== 2) return;
    if (!scrollAreaRef.current) return;

    event.preventDefault();

    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scrollAreaRef.current.scrollLeft,
      scrollTop: scrollAreaRef.current.scrollTop,
    };
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

  function handlePinPointerMove(event, pin) {
    if (movablePinId !== pin.id) return;
    if (event.buttons !== 1) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!mapAreaRef.current) return;

    const rect = mapAreaRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const clamp = (value) => Math.min(1, Math.max(0, value));
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);

    pendingMoveRef.current = { x, y };

    // すでに次の描画を予約している場合、座標だけ更新して待つ
    if (moveFrameRef.current !== null) return;

    moveFrameRef.current = requestAnimationFrame(() => {
      moveFrameRef.current = null;

      const position = pendingMoveRef.current;
      pendingMoveRef.current = null;

      if (position) {
        onPinMove?.(position.x, position.y);
      }
    });
  }

  function finishPinDrag(event) {
    if (moveFrameRef.current !== null) {
      cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }

    const position = pendingMoveRef.current;
    pendingMoveRef.current = null;

    // 最後の位置を確実に反映するためもう一度反映
    if (position) {
      onPinMove?.(position.x, position.y);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const isScaled = scale > 1 && baseSize.width > 0;

  return (
    // 一番外側．relativeを付与してボタンの起点とし、スクロールを受け持つ
    <div
      ref={scrollAreaRef}
      onMouseDown={handleMapMouseDown}
      onContextMenu={(event) => event.preventDefault()}
      className="relative h-full w-full min-w-0 max-w-full overflow-auto p-4"
    >
      {/* ズームボタン（左上に絶対配置＆クリック透過制御） */}
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
        中央寄せ・スクロール見切れ防止用コンテナ
        isScaled === true のときは flex 中央寄せを解除し、m-auto にすることで左上欠けを防止
      */}
      <div
        className={`flex min-h-full min-w-full ${isScaled
            ? ""
            : "items-start justify-center sm:items-center"
          }`}
      >
        {/* 
          ピンと画像を包む箱．
          widthを直接パーセント制御することで、ピンのズレを防ぎつつ
          スクロールコンテナが領域拡大を正常検知できるようにする
        */}
        {/* 
          【修正箇所】
          - origin-top-left を削除（デフォルトの中心拡大にする）
          - outer-wrapper に scale に応じた min-width / min-height を持たせることで、
            中央寄せ（mx-auto）のまま拡大しても上が切れず、ピンもピッタリ追従させます。
          - px単位でアスペクト比を動的に維持適用し、画像のズレと縦潰れを完璧に防止します。
        */}
        <div
          ref={mapAreaRef}
          className="relative mx-auto leading-none transition-all duration-150 sm:m-auto"
          style={
            isScaled
              ? {
                width: `${baseSize.width * scale}px`,
                height: `${(baseSize.width * scale) / baseSize.aspectRatio}px`,
                minWidth: `${baseSize.width * scale}px`,
                minHeight: `${(baseSize.width * scale) / baseSize.aspectRatio}px`,
              }
              : { width: "fit-content", height: "fit-content" }
          }
        >
          <img
            ref={imgRef}
            src={map.image_url}
            alt={map.title || "マップ画像"}
            onClick={handleImageClick}
            onLoad={handleImageLoad}
            className={`block object-fill ${isScaled
              ? "w-full h-full max-h-none max-w-none"
              : "max-h-[70vh] w-auto h-auto"
              } ${onMapClick ? "cursor-crosshair" : ""}`}
          />

          {/* ピンを重ねて表示 */}
          {pins.map((pin) => (
            <button
              key={pin.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();

                // 編集中のピンはドラッグ後のクリックを無視する
                if (movablePinId === pin.id) return;

                onPinClick?.(pin);
              }}
              onPointerDown={(event) => {
                if (movablePinId !== pin.id) return;

                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => handlePinPointerMove(event, pin)}
              onPointerUp={finishPinDrag}
              onPointerCancel={finishPinDrag}
              style={{
                left: `${pin.x * 100}%`,
                top: `${pin.y * 100}%`,
              }}
              className={`absolute -translate-x-1/2 -translate-y-full transition-transform hover:scale-125 focus:outline-none ${movablePinId === pin.id
                  ? "touch-none cursor-grab animate-pulse opacity-70 active:cursor-grabbing"
                  : ""
                }`}
              title={pin.title}
            >
              {pin.kind === "button" ? (
                // ボタンは，押すと別のマップへ移動することが一目で分かるよう，
                // 普通のピン（絵文字がそのまま浮くだけ）とは見た目を変える．
                // 実際の建物の案内サインに寄せて，扉の絵文字＋行き先の名前を出す．
                <span className="flex flex-col items-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-lg text-white shadow-lg ring-2 ring-white">
                    🚪
                  </span>
                  <span className="mt-0.5 max-w-24 truncate rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                    {pin.title}
                  </span>
                </span>
              ) : (
                <EmojiPin emoji={getPinEmoji(pin.pin_type)} size="sm" />

              )}
            </button>
          ))}

          {/* 新しいピンの追加予定位置 */}
          {pendingPin && (
            <div
              aria-hidden="true"
              style={{
                left: `${pendingPin.x * 100}%`,
                top: `${pendingPin.y * 100}%`,
              }}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full animate-pulse"
            >
              {pendingPin.kind === "button" ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-lg text-white shadow-lg ring-2 ring-white">
                  🚪
                </span>
              ) : (
                <EmojiPin emoji={getPinEmoji(pendingPin.pin_type)} preview size="sm" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}