import MapVisibilitySelect from "../components/MapVisibilitySelect.jsx";
import Icon from "../components/Icon.jsx";
import { mapVisibilityValues } from "../lib/mapVisibility.js";
import { getMapCreationErrorMessage, isMapVisibilityMissing, MAP_VISIBILITY_NOT_READY_MESSAGE } from "../lib/mapCreationErrors.js";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { MAP_IMAGE_BUCKET } from "../lib/mapImages";
import { compressImage } from "../lib/imageCompression.js";
import ErrorMessage from "../components/ErrorMessage";

/**
 * マップ新規作成ページ．
 *
 * URL: /maps/new （フォルダの中で作るときは /maps/new?folder=フォルダのid）
 *
 * 流れは3段階．
 *   1. 画像を Supabase Storage（map-images バケット）へアップロードする
 *   2. Storage 内の画像を参照する URL を組み立てる
 *   3. maps テーブルに1行つくり，image_url にそのURLを入れてから詳細ページへ移動する
 *
 * 画像そのものはデータベースに入れない．Storage に置いて，URLだけを保存する．
 */

// 受け付ける画像の種類．
// image/* をそのまま通すと，SVG（中にスクリプトを書ける）や，
// ブラウザが表示できない HEIC まで入ってきてしまうので，明示的に列挙する．
const EXTENSION_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// ファイル名の拡張子から判定するための対応表（上の表が使えないときだけ使う）
const EXTENSION_BY_SUFFIX = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  webp: "webp",
  gif: "gif",
};

// 10MB. 選べる元画像の上限．
// PNG・JPEG は保存する前にブラウザの中で軽くする（lib/imageCompression.js）が，
// GIF・WebP や，軽くできなかった画像は元のまま保存されるので，入口の上限は残している．
// 上げた画像は閲覧のたびに転送されるので，Supabase の無料枠（転送量）を守るための上限でもある．
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ファイル選択の画面で選べる種類．image/* にせず列挙しておくと，
// iPhone は HEIC の写真を JPEG に変換して渡してくれる（HEIC のままだとここでは使えない）．
const ACCEPTED_IMAGE_TYPES = Object.keys(EXTENSION_BY_TYPE).join(",");

/**
 * 受け付けられる画像なら保存用の拡張子を返す．対象外なら null を返す．
 *
 * 判定はまず file.type（ブラウザが教えてくれる種類）で行う．
 * ただし Android のファイル管理アプリや Google Drive 経由で選ぶと，
 * 正しい画像なのに file.type が空になることがある．
 * そのときだけ，ファイル名の拡張子で判定し直す．
 */
function imageExtensionOf(file) {
  const byType = EXTENSION_BY_TYPE[file.type];
  if (byType) return byType;

  // 種類がはっきり分かっていて対象外（SVG など）なら，ここで弾く
  const typeIsUnknown = !file.type || file.type === "application/octet-stream";
  if (!typeIsUnknown) return null;

  const suffix = file.name.includes(".")
    ? file.name.split(".").pop().toLowerCase()
    : "";
  return EXTENSION_BY_SUFFIX[suffix] ?? null;
}

/**
 * 保存するファイル名を作る．
 *
 * crypto.randomUUID は https か localhost でしか使えない．
 * `npm run dev -- --host` してスマホから http://192.168.x.x:5173 を開くと
 * 存在しないので，その場合に備えて代わりの作り方を用意しておく．
 */
function makeFileName(extension) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${id}.${extension ?? "bin"}`;
}

export default function MapUpload() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folder");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // 送信中のどの段階か．ボタンの文言を変えて，待っている理由が分かるようにする．
  // "optimizing"（画像を軽くしている） → "uploading"（送っている）
  const [submitStage, setSubmitStage] = useState("uploading");
  const [error, setError] = useState("");

  // プレビューの表示に成功したかどうか．
  // ファイルの形式とサイズを確認しただけでは，中身が本当に画像かは分からない．
  // 実際に表示できたことをここで確かめてから，送信を許可する．
  const [imageReady, setImageReady] = useState(false);

  // 公開範囲を管理するState
  const [visibility, setVisibility] = useState("public");

  // プレビュー用のURLは，使い終わったら必ず解放する．
  // 放置するとブラウザが画像データを掴んだままになる．
  //
  // 「イベントハンドラの中で setPreviewUrl(URL.createObjectURL(file)) と書けば
  // 短くなるのでは」と思っても，そうしないこと．
  // その形にすると，前に作ったURLを revokeObjectURL する場所が無くなる．
  useEffect(() => {
    setImageReady(false);

    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** 選択を取り消して，同じファイルをもう一度選べる状態に戻す */
  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(event) {
    const picked = event.target.files?.[0] ?? null;
    setError("");

    if (!picked) {
      clearFile();
      return;
    }

    if (!imageExtensionOf(picked)) {
      clearFile();
      setError(
        "この形式は使えません．PNG・JPEG・WebP・GIF のいずれかを選んでください．（iPhone の HEIC は使えません）",
      );
      return;
    }

    if (picked.size === 0) {
      clearFile();
      setError("ファイルの中身が空です．別の画像を選んでください．");
      return;
    }

    if (picked.size > MAX_FILE_SIZE) {
      clearFile();
      setError("画像が大きすぎます．10MB以下のものを選んでください．");
      return;
    }

    setFile(picked);
  }

  /**
   * 日本語入力の変換を確定する Enter で，フォームが送信されてしまう環境がある．
   * 変換中の Enter は送信に使わない．
   */
  function handleTitleKeyDown(event) {
    if (event.key === "Enter" && event.nativeEvent.isComposing) {
      event.preventDefault();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    // ここの2つは，実際にはボタンが disabled なので通常は通らない．
    // 実質のガードは下の canSubmit と disabled 属性のほう．保険として残している．
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("タイトルを入力してください．");
      return;
    }
    if (!file) {
      setError("マップにする画像を選んでください．");
      return;
    }

    setSubmitting(true);
    setSubmitStage("uploading");
    setError("");

    // try / finally で囲むのは必須．
    // 途中で想定外の例外が起きたときに setSubmitting(false) に辿り着けないと，
    // ボタンが「アップロード中...」のまま二度と押せなくなり，リロードするしかなくなる．
    try {
      // 現在ログインしているユーザーを取得する
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("マップを作成するにはログインしてください．");
        return;
      }

      // DBの移行が未適用なら、使われない画像をアップロードする前に止める。
      const { error: schemaError } = await supabase.from("maps").select("visibility").limit(0);
      if (schemaError) {
        setError(isMapVisibilityMissing(schemaError)
          ? MAP_VISIBILITY_NOT_READY_MESSAGE
          : `マップ作成に必要な設定を確認できませんでした。${schemaError.message}`);
        return;
      }

      // 保存する前に画像を軽くする（長辺を縮めて WebP に変換）．
      // 軽くできなかった場合は，元のファイルがそのまま返ってくる．
      setSubmitStage("optimizing");
      const image = await compressImage(file, imageExtensionOf(file));
      setSubmitStage("uploading");

      // ファイル名は毎回変える．同じ名前で上げると，上書きではなく
      // 「すでに存在します」というエラーになって失敗するため．
      const path = makeFileName(image.extension);

      // 1. Storage へアップロード
      //    公開範囲が変更されることがあるため、長期キャッシュを付けない．
      const { error: uploadError } = await supabase.storage
        .from(MAP_IMAGE_BUCKET)
        .upload(path, image.blob, { cacheControl: "0" });

      if (uploadError) {
        console.error("画像のアップロードに失敗", uploadError);
        setError(`画像のアップロードに失敗しました．${uploadError.message}`);
        return;
      }

      // 2. 既存の image_url と同じ形式で保存する。表示時は閲覧権限付きで取得する．
      const { data: urlData } = supabase.storage.from(MAP_IMAGE_BUCKET).getPublicUrl(path);

      // 3. maps テーブルに登録する
      //    .select().single() を付けないと，作成した行の id が返ってこない．
      //    id が分からないと次の移動先が決まらないので必須．
      const { data: created, error: insertError } = await supabase
        .from("maps")
        .insert({
          title: trimmedTitle,
          description: description.trim(),
          image_url: urlData.publicUrl,
          user_id: user.id,
          folder_id: folderId || null,
          ...mapVisibilityValues(visibility),
        })
        .select()
        .single();

      if (insertError) {
        // ここで「アップロード済みの画像を消す」処理は，あえて入れていない．
        // 理由は2つ．いま Storage に削除の権限を与えていないので実行しても失敗すること．
        // そして insertError は「行が作られなかった」ことを意味しないこと
        // （登録は成功したが応答が返らなかった場合もエラーになる）．
        // 消しにいくと「行はあるのに画像だけ無い」という直せない壊れ方をしうる．
        // 使われないまま残った画像は，発表後にダッシュボードからまとめて消す．
        console.error("マップの保存に失敗", insertError);
        setError(getMapCreationErrorMessage(insertError));
        return;
      }

      // 作成できたので詳細ページへ．replace にして，戻るボタンで
      // 作成済みのフォームに戻らないようにする．
      navigate(`/maps/${created.id}`, { replace: true });
    } catch (e) {
      console.error("マップ作成中に予期しないエラー", e);
      setError(`予期しないエラーが発生しました．${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }

  // imageReady を条件に入れているのが大事．
  // これが無いと，壊れた画像を選んだ直後（表示に失敗したと分かる前）に
  // 送信ボタンを押せてしまい，そのままアップロードされる．
  const canSubmit =
    title.trim() !== "" && file !== null && imageReady && !submitting;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-xl px-4 py-4 sm:px-6 sm:py-8">
      <h2 className="text-xl font-bold text-ink">新しいマップを作る</h2>
      <p className="mt-1 text-sm text-sub">
        好きな画像をアップロードすると，その画像がそのまま地図になります．
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div>
          <label
            htmlFor="title"
            className="label"
          >
            タイトル
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            disabled={submitting}
            maxLength={100}
            placeholder="例：大学の構内マップ"
            className="field mt-1"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="label"
          >
            説明（任意）
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            maxLength={500}
            rows={3}
            placeholder="どんなマップかを書いておくと，あとで分かりやすくなります．"
            className="field mt-1"
          />
        </div>

        <MapVisibilitySelect id="mapVisibility" value={visibility} onChange={setVisibility} disabled={submitting} />

        <div>
          <p className="label">
            マップにする画像
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-line-strong bg-surface p-3">
            <input
              id="image"
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              onChange={handleFileChange}
              disabled={submitting}
              className="peer sr-only"
            />

            <label
              htmlFor="image"
              className={`btn peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${submitting ? "pointer-events-none opacity-50" : ""}`}
            >
              <Icon name="image" />
              {file ? "別の画像を選ぶ" : "画像を選ぶ"}
            </label>

            <p className="min-w-0 break-all text-sm text-sub">
              {file ? file.name : "まだ選択されていません"}
            </p>
          </div>

          <p className="mt-1.5 text-xs text-faint">
            PNG・JPEG・WebP・GIF、10MBまで。
          </p>
        </div>

        {previewUrl && (
          <div>
            <p className="label">プレビュー</p>
            <img
              src={previewUrl}
              alt="選択した画像のプレビュー"
              onLoad={() => setImageReady(true)}
              onError={() => {
                // 拡張子だけ画像に見せかけたファイルや，壊れた画像はここで気づける．
                // 送信中は，すでにアップロードが始まっているので何もしない．
                if (submitting) return;
                clearFile();
                setError(
                  "この画像は表示できませんでした．ファイルが壊れているか，画素数が大きすぎるかもしれません．",
                );
              }}
              className="mt-1 max-h-80 w-full rounded-lg border border-line bg-surface object-contain"
            />
          </div>
        )}

        {/* エラーは送信ボタンのすぐ上に出す．画面の一番上に出すと，
            プレビューでスクロールしたときに視界から外れて気づけない． */}
        {error && <ErrorMessage message={error} className="" />}

        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn btn-primary w-full sm:w-auto sm:px-6"
          >
            {!submitting
              ? "このマップを作る"
              : submitStage === "optimizing"
                ? "画像を軽くしています…"
                : "アップロード中…"}
          </button>

          {!submitting && !canSubmit && (
            <p className="mt-2 text-sm text-sub">
              {file && !imageReady
                ? "画像を読み込んでいます．表示できたら送信できます．"
                : "タイトルと画像の両方を入れると送信できます．"}
            </p>
          )}
        </div>
      </form>
      </div>
    </div>
  );
}
