import { createClient } from "@supabase/supabase-js";
import { addMapShareHeaders } from "./mapShareAccess.js";

/**
 * Supabase への接続設定．
 *
 * 使い方：
 *   import { supabase } from "../lib/supabase";
 *   const { data, error } = await supabase.from("maps").select("*");
 *
 * 環境変数は .env.local に書きます．必要な項目は .env.example を見てください．
 *
 * Vite では環境変数名を必ず VITE_ で始める必要があり，
 * 読み出しは process.env ではなく import.meta.env です．
 * AI が NEXT_PUBLIC_ や process.env を使うコードを出してきたら，それは Next.js 用の書き方です．
 *
 * ここで使うのは publishable キー（sb_publishable_ で始まるもの）だけです．
 * これはブラウザに埋め込まれる前提の公開キーで，見えても問題ありません．
 * secret キー（sb_secret_ で始まるもの）は全権限を持つので，絶対に書かないでください．
 */

// 末尾のスラッシュは取り除く．管理画面からコピーすると付いてくることがあり，
// そのままだとリクエスト先のURLにスラッシュが2つ並ぶ．
const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Supabase の環境変数が未設定です．.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を書いてください．",
  );
}

export const supabase = createClient(url, key, {
  global: {
    // RLS が共有リンクの対象を確認できるようにする。ログインの認証情報は SDK に任せる。
    fetch: (input, init) => fetch(input, addMapShareHeaders(input, init, url)),
  },
});
