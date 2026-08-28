import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import ErrorMessage from "../components/ErrorMessage";

/**
 * マップ新規作成ページ．
 *
 * URL: /maps/new （フォルダの中で作るときは /maps/new?folder=フォルダのid）
 *
 * 流れは3段階．
 *   1. 画像を Supabase Storage（map-images バケット）へアップロードする
 *   2. その画像の公開URLを組み立てる
 *   3. maps テーブルに1行つくり，image_url にそのURLを入れてから詳細ページへ移動する
 *
 * 画像そのものはデータベースに入れない．Storage に置いて，URLだけを保存する．
 */

const BUCKET = "map-images";

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

// 10MB. 画像の縮小処理は入れない方針なので，代わりに入口で大きすぎるものを断る．
// 上げた画像は閲覧のたびに転送されるので，Supabase の無料枠（転送量）を守るための上限でもある．
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
function makeFileName(file) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${id}.${imageExtensionOf(file) ?? "bin"}`;
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
  const [error, setError] = useState("");

  // プレビューの表示に成功したかどうか．
  // ファイルの形式とサイズを確認しただけでは，中身が本当に画像かは分からない．
  // 実際に表示できたことをここで確かめてから，送信を許可する．
  const [imageReady, setImageReady] = useState(false);

  // 公開/非公開を管理するState
  const [isPublic, setIsPublic] = useState(true);

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

      // ファイル名は毎回変える．同じ名前で上げると，上書きではなく
      // 「すでに存在します」というエラーになって失敗するため．
      const path = makeFileName(file);

      // 1. Storage へアップロード
      //    cacheControl はブラウザに「この画像は変わらない」と伝えるためのもの．
      //    ファイル名が毎回違うので長くしてよく，転送量の節約になる．
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "31536000" });

      if (uploadError) {
        console.error("画像のアップロードに失敗", uploadError);
        setError(`画像のアップロードに失敗しました．${uploadError.message}`);
        return;
      }

      // 2. 公開URLを組み立てる（通信は発生しない．文字列を作るだけ）
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

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
          is_public: isPublic,     // 保存処理追加
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
        setError(
          `マップの保存に失敗しました．すでに作成されているかもしれないので，一覧を確認してからもう一度試してください．（${insertError.message}）`,
        );
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
    <div className="h-full overflow-auto p-6">
      <h2 className="text-2xl font-bold text-slate-800">新しいマップを作る</h2>
      <p className="mt-1 text-sm text-slate-500">
        好きな画像をアップロードすると，その画像がそのまま地図になります．
      </p>

      <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-5">
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-slate-700"
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
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-slate-700"
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
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
          />
        </div>

        {/* 公開/非公開の切替チェックボックス */}
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex h-5 items-center">
            <input
              id="isPublic"
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-500"
            />
          </div>
          <div className="text-sm">
            <label htmlFor="isPublic" className="font-medium text-slate-700">
              このマップを公開する
            </label>
            <p className="text-slate-500">
              {isPublic
                ? "URLを知っている人なら誰でも閲覧できます．"
                : "自分だけが閲覧できます．他の人がURLを開いても表示されません．"}
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-[#685F5D]">
            マップにする画像
          </p>

          <div className="mt-2 rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-4 text-center">
            <input
              id="image"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={submitting}
              className="sr-only"
            />

            <label
              htmlFor="image"
              className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#F47281] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition ${submitting
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-[#E95F70] hover:shadow-md"
                }`}
            >
              <span aria-hidden="true">🖼️</span>
              {file ? "別の画像を選ぶ" : "画像ファイルを選ぶ"}
            </label>

            <p className="mt-3 break-all text-sm text-[#817878]">
              {file ? (
                <>
                  <span aria-hidden="true">📎</span> {file.name}
                </>
              ) : (
                "まだ画像は選択されていません"
              )}
            </p>
          </div>

          <p className="mt-1.5 text-xs text-[#9A908D]">
            PNG・JPEG・WebP・GIF、10MBまで
          </p>
        </div>

        {previewUrl && (
          <div>
            <p className="text-sm font-medium text-slate-700">プレビュー</p>
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
              className="mt-1 max-h-80 w-full rounded border border-slate-200 object-contain"
            />
          </div>
        )}

        {/* エラーは送信ボタンのすぐ上に出す．画面の一番上に出すと，
            プレビューでスクロールしたときに視界から外れて気づけない． */}
        {error && <ErrorMessage message={error} />}

        <div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded bg-slate-800 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "アップロード中..." : "このマップを作る"}
          </button>

          {!submitting && !canSubmit && (
            <p className="mt-2 text-sm text-slate-500">
              {file && !imageReady
                ? "画像を読み込んでいます．表示できたら送信できます．"
                : "タイトルと画像の両方を入れると送信できます．"}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
