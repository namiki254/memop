import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function AuthButton() {
  // ログインに使うメールアドレスを保持する
  const [email, setEmail] = useState("");

  // 現在のログイン状態を保持する
  const [session, setSession] = useState(null);

  // 画面を開いたときに現在のログイン状態を確認し、
  // その後のログイン・ログアウトの変化も監視する
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 入力されたメールアドレスにログイン用リンクを送信する
  async function handleLogin() {
    const { error } = await supabase.auth.signInWithOtp({
      email,
    });

    if (error) {
      alert("ログインメールの送信に失敗しました");
      console.error(error);
      return;
    }

    alert("ログイン用のメールを送信しました");
  }

  // ログアウトする
  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("ログアウトに失敗しました");
      console.error(error);
    }
  }

  // ログイン済みの場合
  if (session) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">
          {session.user.email}
        </span>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
        >
          ログアウト
        </button>
      </div>
    );
  }

  // ログインしていない場合
  return (
    <div className="flex items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="メールアドレス"
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      />

      <button
        type="button"
        onClick={handleLogin}
        className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
      >
        ログイン
      </button>
    </div>
  );
}