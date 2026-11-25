// ページ全体のエラーとして出すときは余白つき．フォームの中に置くときは className="" で余白を消す．
export default function ErrorMessage({ message, className = "m-4" }) {
  return (
    <div role="alert" className={`notice-error ${className}`}>
      <p className="font-bold">エラーが発生しました</p>
      <p className="mt-1">{message || "予期せぬエラーが発生しました。"}</p>
    </div>
  );
}
