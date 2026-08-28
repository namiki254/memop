import {
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { supabase } from "./lib/supabase.js";
import MapList from "./pages/MapList.jsx";
import MapUpload from "./pages/MapUpload.jsx";
import MapDetail from "./pages/MapDetail.jsx";
import AuthButton from "./components/AuthButton.jsx";
// issue #28 用のテストページ追加
import TestMapView from "./pages/TestMapView.jsx";
import NotFound from "./pages/NotFound.jsx";

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
  const navigate = useNavigate();
  const location = useLocation();

  // 今フォルダの中にいる場合，「新しいマップ」もそのフォルダの中に作られるようにする．
  // ヘッダーは <Routes> の外にあって :folderId を直接は受け取れないので，
  // 今のURLから読み取る．
  const folderMatch = location.pathname.match(/^\/folders\/([^/]+)/);
  const newMapHref = folderMatch
    ? `/maps/new?folder=${folderMatch[1]}`
    : "/maps/new";

  async function handleNewMap() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("新しいマップを作るにはログインしてください");
      return;
    }

    navigate(newMapHref);
  }

  return (
    <div className="flex h-screen w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <header
        className="
          flex min-w-0 flex-wrap items-center gap-2
          border-b border-rose-100
          bg-white/90
          px-4 py-3
          shadow-sm
          backdrop-blur
          sm:flex-nowrap
          sm:gap-6
          sm:px-6
        "
      >
        <Link
          to="/"
          className="
            mr-auto
            shrink-0
            whitespace-nowrap
            text-xl font-black
            tracking-tight
            text-rose-400
            sm:text-2xl
          "
        >
          めもっぷ
        </Link>
        <button
          type="button"
          onClick={handleNewMap}
          className="
            shrink-0
            whitespace-nowrap
            rounded-full
            bg-rose-400
            px-3 py-2
            text-sm font-bold
            text-white
            shadow-sm
            transition
            hover:-translate-y-0.5
            hover:bg-rose-500
            hover:shadow-md
            sm:px-4
          "
        >
          新しいマップ
        </button>
        <AuthButton />
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <Routes>
          <Route path="/" element={<MapList />} />
          <Route path="/folders/:folderId" element={<MapList />} />
          <Route path="/maps/new" element={<MapUpload />} />
          <Route path="/maps/:id" element={<MapDetail />} />
          {/* issue #28 用のテストページ追加 */}
          <Route path="/test" element={<TestMapView />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
