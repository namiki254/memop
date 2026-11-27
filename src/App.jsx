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
import AdminMaps from "./pages/AdminMaps.jsx";
import AdminFolders from "./pages/AdminFolders.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import AdminComments from "./pages/AdminComments.jsx";
import Loading from "./components/Loading.jsx";
import { useMapAccess } from "./lib/mapAccess.js";
import AuthButton from "./components/AuthButton.jsx";
import Icon from "./components/Icon.jsx";
import ToastHost from "./components/Toast.jsx";
import { showToast } from "./lib/toast.js";
import { useKeyboardViewport } from "./lib/useKeyboardViewport.js";
// issue #28 用のテストページ追加
import TestMapView from "./pages/TestMapView.jsx";
import NotFound from "./pages/NotFound.jsx";
import HowToUse from "./pages/HowToUse.jsx";

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
  const searchParams = new URLSearchParams(location.search);
  const linkedPinId = searchParams.get("pin");
  const mapShareToken = searchParams.get("share");
  const linkedUserId = searchParams.get("user")?.toLowerCase() ?? null;
  const { currentUser, authChecked, roleChecked, isAdmin, refreshRole } = useMapAccess();
  // スマホでキーボードが出ている間，下に固定した入力欄やボタンが隠れないよう高さを合わせる
  useKeyboardViewport();
  // マップ詳細（/maps/:id）かどうか．スマホでは地図を広く見せたいので，このヘッダーを出さない．
  // 戻る・ログインは，詳細ページ側の見出しの行に置いてある（MapDetail.jsx）．
  const isMapDetail = /^\/maps\/(?!new\/?$)[^/]+\/?$/.test(location.pathname);
  const accessKey = JSON.stringify([currentUser?.id, isAdmin]);
  const mapList = (
    <MapList
      key={accessKey}
      currentUser={currentUser}
      authChecked={authChecked}
      isAdmin={isAdmin}
    />
  );

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
      showToast("新しいマップを作るにはログインしてください。", { tone: "error" });
      return;
    }

    navigate(newMapHref);
  }

  const adminLinks = [
    ["/admin/maps", "マップ管理"],
    ["/admin/folders", "フォルダ管理"],
    ["/admin/users", "ユーザー管理"],
    ["/admin/comments", "コメント管理"],
  ];

  return (
    <div className="flex h-[var(--app-height,100dvh)] w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <ToastHost />
      <header className={`relative z-40 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface px-4 py-2 sm:gap-x-3 sm:px-6 ${isMapDetail ? "max-sm:hidden" : ""}`}>
        <Link
          to="/"
          className="mr-auto shrink-0 whitespace-nowrap py-1 text-xl font-black tracking-tight text-rose-400 sm:text-2xl"
        >
          めもっぷ
        </Link>

        {/* 管理者向けの移動先．スマホでは2段目に回し，はみ出す分は横スクロールで見せる． */}
        {isAdmin && (
          <nav
            aria-label="管理"
            className="order-last -mx-1 flex basis-full gap-1 overflow-x-auto lg:order-none lg:mx-0 lg:basis-auto"
          >
            {adminLinks.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                aria-current={location.pathname === to ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm ${location.pathname === to
                  ? "bg-ink/5 font-bold text-ink"
                  : "text-sub hover:bg-ink/5 hover:text-ink"
                  }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}

        {/* 作成にはログインが要るので，未ログインのときはボタンを出さない */}
        {currentUser && (
          <button type="button" onClick={handleNewMap} className="btn btn-primary">
            <Icon name="plus" />
            新しいマップ
          </button>
        )}
        
        <Link
          to="/how-to-use"
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-sub hover:bg-ink/5 hover:text-ink"
        >
          使い方
        </Link>

        {/* 未ログインのトップは画面中央にログイン欄があるので，ヘッダーには重ねて出さない */}
        {!(authChecked && !currentUser && location.pathname === "/") && <AuthButton />}
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <Routes>
          <Route path="/" element={mapList} />
          <Route path="/how-to-use" element={<HowToUse />} />
          <Route path="/public-maps" element={<MapList key={`public-${accessKey}`} currentUser={currentUser} authChecked={authChecked} isAdmin={isAdmin} publicOnly />} />
          <Route path="/folders/:folderId" element={mapList} />
          <Route path="/maps/new" element={<MapUpload />} />
          <Route
            path="/maps/:id"
            element={authChecked ? (
              <MapDetail
                key={JSON.stringify([accessKey, location.pathname, linkedPinId, mapShareToken])}
                currentUser={currentUser}
                isAdmin={isAdmin}
              />
            ) : <Loading />}
          />
          <Route
            path="/admin/maps"
            element={<AdminMaps key={accessKey} isAdmin={isAdmin} roleChecked={roleChecked} />}
          />
          <Route
            path="/admin/folders"
            element={<AdminFolders key={accessKey} isAdmin={isAdmin} roleChecked={roleChecked} refreshRole={refreshRole} />}
          />
          <Route
            path="/admin/users"
            element={
              <AdminUsers
                key={JSON.stringify([accessKey, linkedUserId])}
                currentUserId={currentUser?.id}
                linkedUserId={linkedUserId}
                isAdmin={isAdmin}
                roleChecked={roleChecked}
                refreshRole={refreshRole}
              />
            }
          />
          <Route
            path="/admin/comments"
            element={
              <AdminComments key={accessKey} isAdmin={isAdmin} roleChecked={roleChecked} refreshRole={refreshRole} />
            }
          />
          {/* issue #28 用のテストページ追加 */}
          <Route path="/test" element={<TestMapView />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
