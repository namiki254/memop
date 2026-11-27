/**
 * 画面の部品に使う線画アイコン．
 *
 * 絵文字はOSごとに見た目が変わるので，ボタンや見出しにはこちらを使う．
 * （ピンの種類を表す絵文字は，利用者が選ぶ内容そのものなので別扱い．lib/pinTypes.js）
 *
 * 使い方: <Icon name="search" className="size-4" />
 *
 * 大きさの決めごと（揃えるため，これ以外の大きさは使わない）:
 *   - 文字と並べるとき（.btn の中・メニューの項目など）… size-4（16px．何も指定しなければこれ）
 *   - アイコンだけのボタン（.btn-icon）や，行の先頭に置く目印 … size-5（20px）
 */
const PATHS = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  external: <path d="M14 5h5v5M19 5l-8 8M11 6H6v12h12v-5" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  folder: <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.5H19A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V7Z" />,
  map: <path d="m9 5-5.5 2v12L9 17l6 2 5.5-2V5L15 7 9 5Zm0 0v12m6-10v12" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />,
  filter: <path d="M4 7h10m4 0h2M4 17h2m4 0h10M16 4.5v5M8 14.5v5" />,
  list: <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />,
  more: <path d="M12 6h.01M12 12h.01M12 18h.01" strokeWidth="2.6" />,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="1.5" /><path d="m4 16 4.5-4.5 4 4 2.5-2.5 5 5" /><circle cx="15.5" cy="9.5" r="1.2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c.6-3.4 3.4-5.5 7-5.5s6.4 2.1 7 5.5" /></>,
  send: <path d="M12 19V5m-6 6 6-6 6 6" />,
  edit: <path d="M4.5 19.5h3.6L19 8.6a1.9 1.9 0 0 0 0-2.7l-.9-.9a1.9 1.9 0 0 0-2.7 0L4.5 15.9v3.6ZM13.8 6.6l3.6 3.6" />,
  trash: <path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 11.6a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v5M14 11v5" />,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  sort: <path d="M8 5v14m0 0-3.5-3.5M8 19l3.5-3.5M16 19V5m0 0-3.5 3.5M16 5l3.5 3.5" />,
  bookmark: <path d="M7 4.5h10a.5.5 0 0 1 .5.5v14.5L12 16l-5.5 3.5V5a.5.5 0 0 1 .5-.5Z" />,
};

export default function Icon({ name, className = "size-4", filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
