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

  //github ログイン
  async function handleGitHubLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      alert("GitHubログインに失敗しました");
      console.error(error);
    }
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

      <button
        type="button"
        onClick={handleGitHubLogin}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 active:scale-95"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5 fill-current"
        >
          <path d="M12 .7a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.5 5.8 18.5 6 18.5 6c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.4 5.9.4.4.8 1.1.8 2.2v3c0 .3.2.7.8.6A12 12 0 0 0 12 .7Z" />
        </svg>

        GitHubでログイン
      </button>
    </div>
  );
}