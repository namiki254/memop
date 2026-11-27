import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";

/**
 * パンくずリスト（「ホーム › 親フォルダ › 子フォルダ」）．
 *
 * props:
 *   folders        ホームから順に並べたフォルダ．[{ id, name }]
 *   currentIsLast  true なら最後のフォルダを「今いる場所」として文字だけで出す（リンクにしない）．
 *                  フォルダを開いているときは true，マップ詳細から上の階層を指すときは false．
 *   className      外側に足す見た目
 *
 * 区切りは「›」．先頭の「ホーム」には，ほかの画面の「‹ ホーム」と違い矢印を付けない
 * （区切りの「›」と向きの違う矢印が並ぶと，どちらへ進むのか分かりにくくなるため）．
 */
export default function Breadcrumb({ folders, currentIsLast = false, className = "" }) {
  const items = [{ id: "home", name: "ホーム", to: "/" }, ...folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    to: `/folders/${folder.id}`,
  }))];

  return (
    <nav aria-label="パンくずリスト" className={className}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
        {items.map((item, index) => {
          const isCurrent = currentIsLast && index === items.length - 1;
          return (
            <li key={item.id} className="flex min-w-0 items-center gap-x-1">
              {index > 0 && <Icon name="chevronRight" className="size-3.5 text-faint" />}
              {isCurrent ? (
                <span aria-current="page" className="min-w-0 truncate font-medium text-ink">{item.name}</span>
              ) : (
                <Link to={item.to} className="min-w-0 truncate hover:text-ink hover:underline">{item.name}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
