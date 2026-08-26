import { useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function AuthButton() {
    // ログインに使うメールアドレスを保持する
    const [email, setEmail] = useState("");

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