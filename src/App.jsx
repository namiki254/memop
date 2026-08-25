import { Routes, Route, Link, useLocation } from "react-router-dom";
import MapList from "./pages/MapList.jsx";
import MapUpload from "./pages/MapUpload.jsx";
import MapDetail from "./pages/MapDetail.jsx";
// issue #28 用のテストページ追加
import TestMapView from "./pages/TestMapView.jsx";

/**
 * アプリ全体の入れ物．
 *
 * ここには2つの役割があります．
 *   1. 全ページに共通で出る見た目（上のヘッダー）を置く
 *   2. どのURLでどのページを表示するかを決める（<Routes> の部分）
 *
 * ページを追加したら，下の <Routes> の中に <Route> を1行足してください．
 * 1行の追加なら，同じファイルを触っても衝突はほぼ起きません．
 */

export default function App() {
  const location = useLocation();

  // 今フォルダの中にいる場合，「新しいマップ」もそのフォルダの中に作られるようにする．
  // ヘッダーは <Routes> の外にあって :folderId を直接は受け取れないので，
  // 今のURLから読み取る．
  const folderMatch = location.pathname.match(/^\/folders\/([^/]+)/);
  const newMapHref = folderMatch ? `/maps/new?folder=${folderMatch[1]}` : "/maps/new";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
        <Link to="/" className="text-xl font-bold text-slate-800">
          memop
        </Link>

        {/* issue #28 用のテストページへのリンク（確認後消してOK）*/}
        <Link to="/test" className="text-sm text-blue-600 underline">
          [テスト] MapView確認
        </Link>

        <Link
          to={newMapHref}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
        >
          新しいマップ
        </Link>
      </header>

      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<MapList />} />
          <Route path="/folders/:folderId" element={<MapList />} />
          <Route path="/maps/new" element={<MapUpload />} />
          <Route path="/maps/:id" element={<MapDetail />} />
          {/* issue #28 用のテストページ追加 */}
          <Route path="/test" element={<TestMapView />} />
        </Routes>
      </main>
    </div>
  );
}
