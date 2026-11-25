import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { getGithubUsername } from "../lib/displayName.js";
import Icon from "./Icon.jsx";
import { showToast } from "../lib/toast.js";

export default function AuthButton({ centered = false }) {
  // ログインに使うメールアドレスを保持する
  const [email, setEmail] = useState("");

  // 現在のログイン状態を保持する
  const [session, setSession] = useState(null);

  // ログイン処理中かどうか（連打による二重送信を防ぐ）
  const [submitting, setSubmitting] = useState(false);

  // ログイン欄の中に出す結果の文言．{ tone: "info" | "error", text }
  // alert() だとスマホで画面全体が止まるので，押したボタンのそばに出す．
  const [notice, setNotice] = useState(null);

  // ヘッダーに置いたときの，ログイン方法の選択欄の開閉
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

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
    setNotice(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: getReturnUrl(),
        },
      });

      if (error) {
        setNotice({ tone: "error", text: "ログイン用のメールを送信できませんでした。時間をおいて、もう一度お試しください。" });
        console.error(error);
        return;
      }

      setNotice({ tone: "info", text: "ログイン用のメールを送信しました。メール内のリンクを開いてください。" });
    } finally {
      setSubmitting(false);
    }
  }

  //github ログイン
  async function handleGitHubLogin() {
    if (submitting) return;
    setSubmitting(true);
    setNotice(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: getReturnUrl(),
        },
      });

      if (error) {
        setNotice({ tone: "error", text: "GitHubでログインできませんでした。時間をおいて、もう一度お試しください。" });
        console.error(error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Google ログイン
  async function handleGoogleLogin() {
    if (submitting) return;
    setSubmitting(true);
    setNotice(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getReturnUrl(),
        },
      });

      if (error) {
        setNotice({ tone: "error", text: "Googleでログインできませんでした。時間をおいて、もう一度お試しください。" });
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
      showToast("ログアウトできませんでした。もう一度お試しください。", { tone: "error" });
      console.error(error);
    }
  }

  // ログイン済みの場合
  if (session) {
    const githubUsername = getGithubUsername(session.user);

    const displayName = githubUsername
      ? `@${githubUsername}`
      : session.user.email ?? "ログイン中";

    return (
      <div ref={rootRef} className="relative flex min-w-0 shrink-0 items-center gap-1">
        {/* 広い画面では名前とログアウトをそのまま並べる */}
        <span className="hidden max-w-48 truncate text-sm text-sub sm:inline">
          {displayName}
        </span>

        <button type="button" onClick={handleLogout} className="btn btn-quiet hidden sm:inline-flex">
          ログアウト
        </button>

        {/* スマホでは幅が足りないので，アイコンを押したときだけ名前とログアウトを出す */}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="アカウント"
          className="btn-icon sm:hidden"
        >
          <Icon name="user" className="size-5" />
        </button>

        {open && (
          <div
            role="menu"
            aria-label="アカウント"
            className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1 shadow-lg sm:hidden"
          >
            <p className="truncate border-b border-line px-3 py-2 text-xs text-sub">
              {displayName}
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="mt-1 flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-ink hover:bg-ink/5"
            >
              ログアウト
            </button>
          </div>
        )}
      </div>
    );
  }

  // ログインの選択肢．メールは送信回数に上限があるので，GitHub・Google を先に並べる．
  const loginForm = (
    <div className="space-y-2 text-left">
      <button
        type="button"
        onClick={handleGitHubLogin}
        disabled={submitting}
        className="btn w-full"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
          <path d="M12 .7a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.5 5.8 18.5 6 18.5 6c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.4 5.9.4.4.8 1.1.8 2.2v3c0 .3.2.7.8.6A12 12 0 0 0 12 .7Z" />
        </svg>
        GitHubでログイン
      </button>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={submitting}
        className="btn w-full"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Googleでログイン
      </button>

      <div className="flex items-center gap-3 py-1 text-xs text-faint">
        <span className="h-px flex-1 bg-line" />
        <span>または</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleLogin();
        }}
        className="space-y-2"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="メールアドレス"
          aria-label="メールアドレス"
          autoComplete="email"
          className="field"
        />
        <button
          type="submit"
          disabled={submitting || email.trim() === ""}
          className="btn w-full"
        >
          ログイン用のメールを送る
        </button>
      </form>

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={notice.tone === "error"
            ? "notice-error"
            : "rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink"}
        >
          {notice.text}
        </p>
      )}
    </div>
  );

  // ログイン画面の中央に置く場合は，選択肢をそのまま並べる
  if (centered) {
    return loginForm;
  }

  // ヘッダーでは場所を取らないよう，ボタンを押したときだけ選択肢を出す
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="btn"
      >
        ログイン
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="ログイン"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-4 shadow-lg"
        >
          {loginForm}
        </div>
      )}
    </div>
  );
}