import HomeLink from "../components/HomeLink.jsx";

export default function NotFound() {
  return (
    <div className="grid h-full min-h-80 place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-bold tracking-widest text-faint">404</p>
        <h1 className="mt-2 text-xl font-bold text-ink">
          ページが見つかりません
        </h1>
        <p className="mt-2 text-sm text-sub">
          URLが変わったか、削除された可能性があります。
        </p>

        <HomeLink className="btn btn-primary mt-6" />
      </div>
    </div>
  );
}
