import { Link } from "react-router-dom";

export default function HowToUse() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          memopの使い方
        </h1>
        <p className="mt-3 text-sub">
          地図を作成して、思い出の場所を記録・共有してみましょう。
        </p>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-bold text-ink">
            1. 地図を作成する
          </h2>
          <p className="mt-3 leading-7 text-sub">
            画像をアップロードして、自分だけの地図を作成します。
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-bold text-ink">
            2. ピンを追加してメモを残す
          </h2>
          <p className="mt-3 leading-7 text-sub">
            地図上の記録したい場所をクリックまたはタップしてピンを追加します。
            タイトルやメモを入力して、場所の思い出を保存しましょう。
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-xl font-bold text-ink">
                3. 地図を共有する
            </h2>

            <p className="mt-3 leading-7 text-sub">
                地図の公開範囲を設定して、共有用のURLをコピーします。
                公開範囲は、以下の3種類から選択できます。
            </p>

            <ul className="mt-3 list-disc space-y-2 pl-6 leading-7 text-sub">
                <li>
                <strong className="text-ink">公開：</strong>
                公開マップ一覧に掲載され、ログインせずに誰でも閲覧できます。
                </li>
                <li>
                <strong className="text-ink">URL限定公開：</strong>
                公開マップ一覧には掲載されず、共有URLを知っている人が閲覧できます。
                </li>
                <li>
                <strong className="text-ink">非公開：</strong>
                作成者と管理者だけが閲覧できます。
                </li>
            </ul>

            <p className="mt-3 leading-7 text-sub">
                地図を共有したい場合は、公開範囲を「公開」または
                「URL限定公開」に設定し、共有URLを相手に送ります。
            </p>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/" className="btn btn-primary">
          地図一覧へ戻る
        </Link>
        <Link to="/maps/new" className="btn">
          地図を作成する
        </Link>
      </div>
    </div>
  );
}