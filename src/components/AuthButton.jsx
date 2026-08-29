import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function AuthButton({ centered = false }) {
  // ログインに使うメールアドレスを保持する
  const [email, setEmail] = useState("");

  // 現在のログイン状態を保持する
  const [session, setSession] = useState(null);

  // ログイン処理中かどうか（連打による二重送信を防ぐ）
  const [submitting, setSubmitting] = useState(false);

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
  function getReturnUrl() {
    const url = new URL(window.location.href);
    url.hash = "";

    return url.href;
  }

  // 入力されたメールアドレスにログイン用リンクを送信する
  async function handleLogin() {
    if (submitting) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: getReturnUrl(),
        },
      });

      if (error) {
        alert("ログインメールの送信に失敗しました");
        console.error(error);
        return;
      }

      alert("ログイン用のメールを送信しました");
    } finally {
      setSubmitting(false);
    }
  }

  //github ログイン
  async function handleGitHubLogin() {
    if (submitting) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: getReturnUrl(),
        },
      });

      if (error) {
        alert("GitHubログインに失敗しました");
        console.error(error);
      }
    } finally {
      setSubmitting(false);
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
    const metadata = session.user.user_metadata ?? {};

    const githubIdentity = session.user.identities?.find(
      (identity) => identity.provider === "github",
    );

    const identityData = githubIdentity?.identity_data ?? {};

    const githubUsername =
      metadata.user_name ??
      metadata.preferred_username ??
      identityData.user_name ??
      identityData.preferred_username ??
      metadata.name ??
      identityData.name;

    const displayName = githubUsername
      ? `@${githubUsername}`
      : session.user.email ?? "ログイン中";

    return (
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <span className="hidden max-w-48 truncate text-sm text-slate-600 sm:inline">
          {displayName}
        </span>

        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 whitespace-nowrap rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
        >
          ログアウト
        </button>
      </div>
    );
  }

  // ログインしていない場合
  return (
    <div
      className={`flex w-full min-w-0 items-center gap-2 ${centered
        ? "flex-wrap justify-center"
        : "flex-wrap justify-end sm:w-auto sm:flex-nowrap"
        }`}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        className="min-w-0 flex-1 rounded-full border border-slate-300 px-2 py-1 text-xs"
      />

      <button
        type="button"
        onClick={handleLogin}
        disabled={submitting}
        className="shrink-0 whitespace-nowrap rounded-full bg-[#FFF0F1] px-3 py-1.5 text-xs font-bold text-[#C95765] transition hover:bg-[#FFDDE1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF0F1]"
      >
        ログイン
      </button>

      {centered && (
        <div className="flex basis-full items-center gap-3 py-0.5 text-[11px] text-slate-800">
          <span className="h-px flex-1 bg-slate-200" />
          <span>または</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      )}

      <button
        type="button"
        onClick={handleGitHubLogin}
        disabled={submitting}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 active:scale-95 disabled:opacity-50
          ${centered ? "basis-full" : "basis-full sm:basis-auto"
          }`}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5 fill-current"
        >
          <path d="M12 .7a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.5 5.8 18.5 6 18.5 6c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.4 5.9.4.4.8 1.1.8 2.2v3c0 .3.2.7.8.6A12 12 0 0 0 12 .7Z" />
        </svg>

        GitHubログイン
      </button>
    </div>
  );
}