/**
 * アップロード前に，ブラウザの中で画像を軽くする．
 *
 * マップ画像は一覧のサムネイルでも詳細でも同じファイルを読み込むので，
 * 元のファイルが重いと，開くたびに待ち時間と通信量がかかる．
 * そこで保存する前に「長辺を縮める」「WebP に変換する」の2つを行う．
 *
 * ピンの位置は画像に対する割合（0〜1）で持っているので，画像を縮めてもずれない．
 */

// 長辺の上限（px）．地図は拡大して細部を見るので，写真の共有などより大きめに残す．
export const MAX_IMAGE_DIMENSION = 2560;
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * 画像を軽くして返す．軽くできない・しないほうがよいときは，元のファイルをそのまま返す．
 *
 * 引数:
 *   file       選ばれた画像ファイル
 *   extension  その画像の種類（"png" / "jpg" / "webp" / "gif"）
 *
 * 戻り値: { blob, extension, compressed }
 *   blob        アップロードする中身
 *   extension   保存するファイル名に付ける拡張子
 *   compressed  軽くした場合 true
 */
export async function compressImage(file, extension) {
  const original = { blob: file, extension, compressed: false };

  // GIF と WebP は動く画像のことがあり，描き直すと1コマ目だけになってしまうので触らない．
  if (extension !== "png" && extension !== "jpg") return original;

  const url = URL.createObjectURL(file);

  try {
    // <img> で読み込むと，スマホの写真に付いている「向き」の情報どおりに回転した状態で描ける．
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();

    const { naturalWidth, naturalHeight } = image;
    if (!naturalWidth || !naturalHeight) return original;

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));

    const context = canvas.getContext("2d");
    if (!context) return original;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
    let compressedExtension = "webp";

    // WebP で書き出せないブラウザは，頼んだ種類と違う画像（PNG）を返してくる．
    if (!blob || blob.type !== "image/webp") {
      // PNG は透明な部分を持てるが JPEG は持てないので，PNG は元のまま保存する．
      if (extension !== "jpg") return original;

      blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
      compressedExtension = "jpg";
      if (!blob || blob.type !== "image/jpeg") return original;
    }

    // もともと十分に軽い画像は，変換するとかえって重くなることがある．
    if (blob.size >= file.size) return original;

    return { blob, extension: compressedExtension, compressed: true };
  } catch (error) {
    // 画素数が大きすぎて描けない場合など．軽くするのは諦めて，元のまま保存する．
    console.warn("画像を軽くできなかったので，元のまま保存します", error);
    return original;
  } finally {
    URL.revokeObjectURL(url);
  }
}
