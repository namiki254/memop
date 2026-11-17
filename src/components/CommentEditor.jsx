import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

export default function CommentEditor({ commentId, content, onSave, onCancel }) {
  // 編集を開いた時点の本文を覚えて、他の人の変更を上書きしないようにする。
  const [originalContent] = useState(content ?? null);
  const [draft, setDraft] = useState(content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const trimmedDraft = draft.trim();
  const canSave = trimmedDraft !== "" && trimmedDraft !== originalContent;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function saveComment(event) {
    event.preventDefault();
    if (saving || !canSave) return;

    setSaving(true);
    setError("");

    // Supabase には対象IDと本文だけを渡す。権限判定にはログイン情報が使われる。
    const { data, error: saveError } = await supabase.rpc("edit_pin_comment", {
      target_comment_id: String(commentId),
      expected_content: originalContent,
      new_content: trimmedDraft,
    });

    if (saveError?.code === "PGRST202") {
      setError("コメント編集は現在利用できません。運営担当者にお問い合わせください。");
    } else if (saveError) {
      setError("コメントの保存結果を確認できませんでした。入力内容を控えて、画面を再読み込みしてください。");
    } else if (data === null) {
      // 権限が変わった場合や他の人が先に変更した場合も、入力を残して案内する。
      setError("コメントを保存できませんでした。入力内容を控えて、画面を再読み込みしてください。");
    } else {
      onSave(data, originalContent);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={saveComment} className="mt-2 space-y-2 text-sm">
      <textarea
        ref={inputRef}
        aria-label="コメント本文"
        className="w-full rounded-md border border-rose-200 bg-white p-2 text-sm text-slate-800"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={saving}
        rows={3}
      />
      {error && <p role="alert" className="break-words text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !canSave} className="rounded-md bg-rose-600 px-3 py-1 text-white disabled:opacity-50">
          {saving ? "保存中…" : "保存"}
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className="rounded-md px-2 py-1 text-slate-700 hover:bg-white disabled:opacity-50">
          キャンセル
        </button>
      </div>
    </form>
  );
}
