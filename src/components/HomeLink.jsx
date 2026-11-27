import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";

/**
 * ホームへのリンク．どの画面でも「‹ ホーム」の形にそろえる．
 *
 * className で見た目を足す（ボタンにするなら "btn"，パンくずの中なら文字のリンクのまま）．
 * アイコンと文字の間は，文字のリンクのときは詰め，ボタンのときは .btn の間隔に任せる．
 */
export default function HomeLink({ className = "" }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-0.5 ${className}`}>
      <Icon name="chevronLeft" />
      ホーム
    </Link>
  );
}
