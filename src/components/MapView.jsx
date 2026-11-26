import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { getPinEmoji } from "../lib/pinTypes";
import { useMapImage } from "../lib/mapImages";
import { EmojiPin } from "./EmojiPin"
import Icon from "./Icon.jsx";
import { scrollBehavior } from "../lib/motion.js";

/**
 * 地図表示コンポーネント．
 *
 * マップ画像を表示し，その上にピンを重ねる．
 *
 * props:
 *   map        maps テーブルの1行．{ id, title, description, image_url, created_at }
 *   pins       pins テーブルの配列．{ id, map_id, x, y, title, content, pin_type, created_at }
 *   selectedPinId 詳細パネルで開いているピンの id．そのピンを強調表示する（未選択なら null）
 *   onPinClick ピンがクリックされたときに呼ぶ．引数はそのピン
 *   onMapClick 画像の何もない場所がクリックされたときに呼ぶ．引数は x と y（どちらも0〜1）
 *   dense      スマホでピンのパネルが開いているなど，地図の領域が狭いとき true．余白と拡大ボタンを省く（拡大はピンチでできる）
 *
 * 座標について：
 *   x と y は「画像に対する割合」．ピクセルではない．
 *   x = 0.35, y = 0.62 なら「画像の左から35%，上から62%の位置」という意味．
 *   こうしておくと，画面や画像の大きさが変わってもピンがずれない．
 */


export function MapView({ map, pins = [], pendingPin = null, selectedPinId = null, onPinClick, onMapClick, onPinDoubleClick, movablePinId, onPinMove, dense = false, }) {
  const { src: imageSrc, loading: imageLoading } = useMapImage(map?.image_url);

  // 拡大率（scale）、最大拡大率（maxScale）のStateを管理
  const [scale, setScale] = useState(1);
  const [maxScale, setMaxScale] = useState(2); // フォールバック用初期値

  // 初期（1倍時）の表示サイズと画像のアスペクト比を保持
  const [baseSize, setBaseSize] = useState({
    width: 0,
    height: 0,
    aspectRatio: 1,
  });
  // 画像を描けたら true．それまでは透明にしておき，画像とピンをまとめてふわっと出す
  // （ピンだけ先に見えて，あとから画像が出るのを防ぐ）．
  const [imageShown, setImageShown] = useState(false);
  const imgRef = useRef(null);
  const mapAreaRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const dragStartRef = useRef(null);
  // ドラッグで地図を動かしている最中かどうか（カーソルの形を変えるため）
  const [isPanning, setIsPanning] = useState(false);
  // ドラッグの直後に届くクリックを1回だけ無視するための印．
  // 無視しないと，地図を動かし終えた場所にピンの追加が始まったり，ピンが開いたりしてしまう．
  const suppressClickRef = useRef(false);
  const moveFrameRef = useRef(null);
  const pendingMoveRef = useRef(null);

  // ホイールで拡大・縮小するときに使う値（#19）
  // ホイール操作中は追いかけるアニメーションを切り，ポインターの下の地点がずれないようにする
  const [animateZoom, setAnimateZoom] = useState(true);
  const scaleRef = useRef(scale);
  const maxScaleRef = useRef(maxScale);
  const wheelDeltaRef = useRef(0);
  const zoomAnchorRef = useRef(null);
  // スマホで2本指を広げる・つまむ（ピンチ）操作の開始時の状態
  const pinchRef = useRef(null);
  scaleRef.current = scale;
  maxScaleRef.current = maxScale;

  const MIN_SCALE = 1; // 最小表示を1倍に設定
  const SCALE_STEP = 0.25; // 0.25刻みのスケール
  // ホイールをこの量（px）回すごとに1段階（SCALE_STEP）拡大・縮小する．
  // マウスは1ノッチでおおむね100px なので1段階，タッチパッドは細かく届くので貯めてから動かす．
  const WHEEL_STEP_DELTA = 40;
  const WHEEL_NOTCH_DELTA = 100; // マウスホイール1ノッチ分のおおよその量（px）
  // 左ボタンを押したままこの距離（px）以上動かしたら，クリックではなく「地図を動かすドラッグ」とみなす
  const PAN_START_DISTANCE = 4;

  const handleZoomIn = () => {
    setAnimateZoom(true);
    setScale((prev) => Math.min(prev + SCALE_STEP, maxScale));
  };
  const handleZoomOut = () => {
    setAnimateZoom(true);
    setScale((prev) => Math.max(prev - SCALE_STEP, MIN_SCALE));
  };

  // 画像読み込みのタイミングで、表示サイズ（clientWidth）と元画像サイズ（naturalWidth）からmaxScaleを計算
  const handleImageLoad = (e) => {
    setImageShown(true);
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

  // マップ上でホイールを回したら拡大・縮小する（#19）．
  // React の onWheel はブラウザの都合で preventDefault() が効かない（passive）ため，
  // addEventListener で passive: false を指定して直接登録する．
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    function handleWheel(event) {
      const mapArea = mapAreaRef.current;
      // 地図（画像とピン）の上でだけ反応する．余白やズームボタンの上では通常どおりスクロールさせる
      if (!mapArea || !mapArea.contains(event.target)) return;

      // 画像の大きさが分かるまでは拡大できないので，通常のスクロールに任せる
      const rect = mapArea.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // 地図の上では，ページやスクロール領域が動かないようにする
      event.preventDefault();

      // deltaMode が行単位・ページ単位のブラウザもあるので px に揃える
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= scrollArea.clientHeight;

      // 回す向きが変わったら貯めた量を捨てる
      if (Math.sign(delta) !== Math.sign(wheelDeltaRef.current)) {
        wheelDeltaRef.current = 0;
      }
      wheelDeltaRef.current += delta;
      if (Math.abs(wheelDeltaRef.current) < WHEEL_STEP_DELTA) return;

      // 上に回す（deltaY が負）と拡大，下に回すと縮小．上限・下限はボタンと同じ
      const direction = wheelDeltaRef.current < 0 ? 1 : -1;
      // 一度に大きく回したとき（数ノッチ分がまとめて届いたとき）は，その分だけ段階を進める
      const steps = Math.max(1, Math.round(Math.abs(wheelDeltaRef.current) / WHEEL_NOTCH_DELTA));
      wheelDeltaRef.current = 0;

      const current = scaleRef.current;
      const next = Math.min(
        Math.max(current + direction * steps * SCALE_STEP, MIN_SCALE),
        maxScaleRef.current,
      );
      if (next === current) return;

      // ポインターが地図のどこ（割合）にあるかを覚えておき，拡大・縮小後に同じ地点がポインターの下に来るようにする
      zoomAnchorRef.current = {
        ratioX: (event.clientX - rect.left) / rect.width,
        ratioY: (event.clientY - rect.top) / rect.height,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      scaleRef.current = next;
      setAnimateZoom(false);
      setScale(next);
    }

    scrollArea.addEventListener("wheel", handleWheel, { passive: false });
    return () => scrollArea.removeEventListener("wheel", handleWheel);
    // 画像が表示されて初めてスクロール領域が作られるので，imageSrc が変わったら付け直す
  }, [imageSrc]);

  /**
   * 地図上の地点（anchor.ratioX, ratioY：地図に対する割合）が，
   * 画面上の位置（anchor.clientX, clientY）に来るようにスクロールする．
   */
  function scrollPointUnder(anchor) {
    const scrollArea = scrollAreaRef.current;
    const mapArea = mapAreaRef.current;
    if (!scrollArea || !mapArea) return;

    const rect = mapArea.getBoundingClientRect();
    // 拡大・縮小後に，覚えておいた地点が画面のどこに来たか
    const pointX = rect.left + anchor.ratioX * rect.width;
    const pointY = rect.top + anchor.ratioY * rect.height;

    // その地点がポインター（指）の位置に戻るようにスクロールする
    scrollArea.scrollLeft += pointX - anchor.clientX;
    scrollArea.scrollTop += pointY - anchor.clientY;
  }

  // ホイールやピンチで拡大・縮小した直後，描画が確定してから（画面に出る前に）スクロール位置を合わせる
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (anchor) scrollPointUnder(anchor);
  }, [scale]);

  // スマホでは，地図の上で2本指を広げると拡大，つまむと縮小する（#19）．
  // ホイールと同じく preventDefault() を使うので passive: false で直接登録する．
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    // 2本の指の中間点と，指どうしの距離
    function getPinchPoint(touches) {
      const [a, b] = [touches[0], touches[1]];
      return {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      };
    }

    function handleTouchStart(event) {
      pinchRef.current = null;
      if (event.touches.length !== 2) return;

      // 2本とも地図（画像とピン）の上に置いたときだけピンチとして扱う
      const mapArea = mapAreaRef.current;
      if (!mapArea) return;
      if (![...event.touches].every((touch) => mapArea.contains(touch.target))) return;

      const rect = mapArea.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const { x, y, distance } = getPinchPoint(event.touches);
      if (distance === 0) return;

      // 指を置いたときに2本の指の間にあった地点を覚えておき，ピンチ中もその地点を指の間に保つ
      pinchRef.current = {
        startDistance: distance,
        startScale: scaleRef.current,
        ratioX: (x - rect.left) / rect.width,
        ratioY: (y - rect.top) / rect.height,
      };
    }

    function handleTouchMove(event) {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;

      // ブラウザがページ全体を拡大・縮小しないようにする
      event.preventDefault();

      const { x, y, distance } = getPinchPoint(event.touches);
      // 指の間隔が開いた割合だけ拡大する．上限・下限はボタンと同じ
      const next = Math.min(
        Math.max(pinch.startScale * (distance / pinch.startDistance), MIN_SCALE),
        maxScaleRef.current,
      );
      const anchor = { ratioX: pinch.ratioX, ratioY: pinch.ratioY, clientX: x, clientY: y };

      if (next === scaleRef.current) {
        // 上限・下限で倍率が変わらなくても，2本指を動かした分だけ地図を動かす
        scrollPointUnder(anchor);
        return;
      }

      zoomAnchorRef.current = anchor;
      scaleRef.current = next;
      setAnimateZoom(false);
      setScale(next);
    }

    function handleTouchEnd(event) {
      // 指が1本以下になったらピンチ終了．残った1本指は通常どおりスクロールに使える
      if (event.touches.length < 2) pinchRef.current = null;
    }

    scrollArea.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollArea.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollArea.addEventListener("touchend", handleTouchEnd);
    scrollArea.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      scrollArea.removeEventListener("touchstart", handleTouchStart);
      scrollArea.removeEventListener("touchmove", handleTouchMove);
      scrollArea.removeEventListener("touchend", handleTouchEnd);
      scrollArea.removeEventListener("touchcancel", handleTouchEnd);
    };
    // 画像が表示されて初めてスクロール領域が作られるので，imageSrc が変わったら付け直す
  }, [imageSrc]);

  // ドラッグ中のマウス移動を画面全体で監視する（地図の外まで動かしても追いかけられるように）．
  // 左ボタンでも右ボタンでも動かせる．スマホは1本指のスクロールで動かせるので，ここはマウス用．
  useEffect(() => {
    function handleMouseMove(event) {
      const drag = dragStartRef.current;
      if (!drag) return;
      if (!scrollAreaRef.current) return;

      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;

      // 左ボタンは「クリック（ピンを追加・開く）」にも使うので，
      // 少し（PAN_START_DISTANCE）動かすまではドラッグとみなさない．
      if (!drag.moved) {
        if (drag.button === 0 && Math.hypot(deltaX, deltaY) < PAN_START_DISTANCE) return;
        drag.moved = true;
        setIsPanning(true);
      }

      scrollAreaRef.current.scrollLeft = drag.scrollLeft - deltaX;
      scrollAreaRef.current.scrollTop = drag.scrollTop - deltaY;
    }

    function handleMouseUp(event) {
      const drag = dragStartRef.current;
      if (!drag || event.button !== drag.button) return;

      dragStartRef.current = null;
      setIsPanning(false);

      // 左ボタンで動かした直後は，ボタンを離した場所に click が届く．それを1回だけ無視する．
      // click はこの直後に届くので，届かなかった場合に印が残らないよう，すぐ後で必ず消す．
      if (drag.button === 0 && drag.moved) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // 追加中・選択中のピンが画面の外や下のパネルの裏に隠れないよう，見える位置までスクロールする．
  // スマホではパネルが開くと地図の表示領域が縮むので，領域の大きさが変わったときにも確かめ直す．
  const focusTarget =
    pendingPin ??
    (selectedPinId != null
      ? pins.find((pin) => pin.id === selectedPinId) ?? null
      : null);
  const focusTargetRef = useRef(focusTarget);
  focusTargetRef.current = focusTarget;
  // 既存ピンをドラッグで動かしている間は追いかけない（id だけを鍵にする）
  const focusKey = !focusTarget
    ? null
    : focusTarget.id ?? `new:${focusTarget.x}:${focusTarget.y}`;
  const hasImage = Boolean(imageSrc);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea || !hasImage || focusKey === null) return;

    function revealFocusTarget() {
      const target = focusTargetRef.current;
      const mapArea = mapAreaRef.current;
      if (!target || !mapArea) return;

      const view = scrollArea.getBoundingClientRect();
      const image = mapArea.getBoundingClientRect();
      if (image.width === 0 || image.height === 0) return;

      // ピンは座標の真上に描かれるので，上側に多めの余白を取る
      const pinX = image.left + image.width * target.x;
      const pinY = image.top + image.height * target.y;
      const top = pinY - 72;
      const bottom = pinY + 24;
      const left = pinX - 56;
      const right = pinX + 56;

      let dx = 0;
      let dy = 0;
      if (top < view.top) dy = top - view.top;
      else if (bottom > view.bottom) dy = bottom - view.bottom;
      if (left < view.left) dx = left - view.left;
      else if (right > view.right) dx = right - view.right;

      if (dx !== 0 || dy !== 0) {
        scrollArea.scrollBy({ left: dx, top: dy, behavior: scrollBehavior() });
      }
    }

    revealFocusTarget();

    const observer = new ResizeObserver(revealFocusTarget);
    observer.observe(scrollArea);
    return () => observer.disconnect();
  }, [focusKey, hasImage]);

  if (!imageSrc) {
    let message = "地図画像がありません";
    if (imageLoading) message = "地図画像を読み込み中…";
    else if (map?.image_url) message = "地図画像を読み込めませんでした";

    return (
      <div className="grid h-full w-full place-items-center text-sub">
        <div className="text-center">
          <p className="text-sm font-bold">{message}</p>
          <p className="mt-2 text-sm">
            {map?.title || "未選択"} / ピン {pins.length} 件
          </p>
        </div>
      </div>
    );
  }

  // ドラッグ開始時の位置を保存（左ボタン・右ボタン）
  function handleMapMouseDown(event) {
    if (event.button !== 0 && event.button !== 2) return;
    if (!scrollAreaRef.current) return;
    // 位置を編集中のピンは，ピン自体をドラッグして動かすので，地図は動かさない
    if (event.target.closest?.("[data-pin-movable]")) return;

    // 右ボタンはメニューを出さないために既定の動作を止める．
    // 左ボタンは止めない（止めると，押した場所へのフォーカスの移動まで止まってしまう）．
    if (event.button === 2) event.preventDefault();

    dragStartRef.current = {
      button: event.button,
      moved: false,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scrollAreaRef.current.scrollLeft,
      scrollTop: scrollAreaRef.current.scrollTop,
    };
  }

  // ドラッグで地図を動かした直後のクリックは，ピンや画像に届く前にここで止める
  function handleClickCapture(event) {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
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
    // 一番外側．拡大・縮小ボタンの起点．スクロールは内側の箱が受け持つ
    <div className="relative h-full w-full min-w-0 max-w-full">
      {/* 拡大・縮小ボタン．右下はピンのパネルが出る場所なので左下に置く． */}
      <div className={`absolute bottom-3 left-3 z-20 rounded-lg border border-line-strong bg-surface shadow-sm ${dense ? "hidden sm:flex" : "flex"}`}>
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={scale <= MIN_SCALE}
          className="btn-icon"
          aria-label="縮小"
          title="縮小"
        >
          <Icon name="minus" className="size-5" />
        </button>
        <span className="my-2 w-px bg-line" />
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={scale >= maxScale}
          className="btn-icon"
          aria-label="拡大"
          title="拡大"
        >
          <Icon name="plus" className="size-5" />
        </button>
      </div>

    <div
      ref={scrollAreaRef}
      onMouseDown={handleMapMouseDown}
      onClickCapture={handleClickCapture}
      onContextMenu={(event) => event.preventDefault()}
      // 上下の余白は，地図に重ねた操作ボタンと画像が重ならないようにするためのもの．
      // スマホでピンのパネルが開いている間（dense）は地図の領域が狭いので，余白を詰める．
      // overscroll-contain：地図を端まで動かしたとき，ページ全体が引っ張られたり，
      // 下に引いて再読み込みが始まったりしないようにする．
      className={`h-full w-full min-w-0 max-w-full overflow-auto overscroll-contain px-3 pb-16 pt-16 sm:px-4 ${dense ? "max-sm:pb-3 max-sm:pt-3" : ""} ${isPanning ? "cursor-grabbing select-none [&_*]:cursor-grabbing" : ""}`}
    >
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
          // ボタンでの拡大・縮小はなめらかに動かす．ホイールのときはポインター位置を保つためアニメーションしない
          // touch-pan-x touch-pan-y：地図の上では1本指のスクロールだけブラウザに任せ，2本指のピンチはページ全体ではなく地図の拡大・縮小に使う
          // 動かす性質は名指しする（transition-all だと，関係のない変化までアニメーションして重くなる）
          className={`relative mx-auto touch-pan-x touch-pan-y leading-none sm:m-auto ${animateZoom ? "transition-[width,height,min-width,min-height,opacity] duration-150 motion-reduce:transition-none" : ""}`}
          style={
            isScaled
              ? {
                width: `${baseSize.width * scale}px`,
                height: `${(baseSize.width * scale) / baseSize.aspectRatio}px`,
                minWidth: `${baseSize.width * scale}px`,
                minHeight: `${(baseSize.width * scale) / baseSize.aspectRatio}px`,
                opacity: imageShown ? 1 : 0,
              }
              : { width: "fit-content", height: "fit-content", opacity: imageShown ? 1 : 0 }
          }
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt={map.title || "マップ画像"}
            onClick={handleImageClick}
            onLoad={handleImageLoad}
            // 描けなかったときも透明のままにしない（代わりの文字とピンは見えるようにする）
            onError={() => setImageShown(true)}
            decoding="async"
            // ブラウザ標準の「画像をつかんで持ち出す」動作を止める（地図を動かすドラッグとぶつかるため）
            draggable={false}
            // カーソル：押すとピンを追加できるときは十字．見るだけで，拡大していて動かせるときは「つかめる手」．
            className={`block select-none object-fill ${isScaled
              ? "w-full h-full max-h-none max-w-none"
              : "max-h-[70vh] w-auto h-auto"
              } ${onMapClick ? "cursor-crosshair" : isScaled ? "cursor-grab" : ""}`}
          />

          {/* ピンを重ねて表示 */}
          {pins.map((pin) => {
            const isSelected = selectedPinId != null && pin.id === selectedPinId;

            return (
            <button
              key={pin.id}
              type="button"
              aria-pressed={isSelected}
              onClick={(event) => {
                event.stopPropagation();

                // 編集中のピンはドラッグ後のクリックを無視する
                if (movablePinId === pin.id) return;

                onPinClick?.(pin);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();

                if (movablePinId === pin.id) return;

                onPinDoubleClick?.(pin);
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
              // 位置を編集中の目印．このピンの上で始めたドラッグでは地図を動かさない（handleMapMouseDown）
              data-pin-movable={movablePinId === pin.id ? "" : undefined}
              style={{
                left: `${pin.x * 100}%`,
                top: `${pin.y * 100}%`,
              }}
              // 選択中のピンは少し大きくし，他のピンより手前に出して重なっても隠れないようにする
              className={`absolute origin-bottom -translate-x-1/2 -translate-y-full transition-transform hover:scale-125 focus:outline-none ${isSelected
                ? "z-10 scale-125"
                : ""
                } ${movablePinId === pin.id
                ? "touch-none cursor-grab animate-pulse opacity-70 active:cursor-grabbing motion-reduce:animate-none"
                : ""
                }`}
              title={pin.title}
            >
              {pin.kind === "button" ? (
                // ボタンは，押すと別のマップへ移動することが一目で分かるよう，
                // 普通のピン（絵文字がそのまま浮くだけ）とは見た目を変える．
                // 実際の建物の案内サインに寄せて，扉の絵文字＋行き先の名前を出す．
                <span className="flex flex-col items-center">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-ink text-lg text-white shadow-md ${isSelected
                    ? "ring-4 ring-accent ring-offset-2 ring-offset-white"
                    : "ring-2 ring-white"
                    }`}>
                    🚪
                  </span>
                  <span className={`mt-0.5 max-w-24 truncate rounded bg-ink px-1.5 py-0.5 text-xs font-bold text-white shadow ${isSelected
                    ? "ring-2 ring-accent"
                    : ""
                    }`}>
                    {pin.title}
                  </span>
                </span>
              ) : (
                <EmojiPin emoji={getPinEmoji(pin.pin_type)} selected={isSelected} size="sm" />

              )}
            </button>
            );
          })}

          {/* 新しいピンの追加予定位置 */}
          {pendingPin && (
            <div
              aria-hidden="true"
              style={{
                left: `${pendingPin.x * 100}%`,
                top: `${pendingPin.y * 100}%`,
              }}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full animate-pulse motion-reduce:animate-none"
            >
              {pendingPin.kind === "button" ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-lg text-white shadow-md ring-2 ring-white">
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
    </div>
  );
}