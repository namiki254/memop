import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const SAVE_TARGETS = {
    map: {
        table: "saved_maps",
        idColumn: "map_id",
    },
    folder: {
        table: "saved_folders",
        idColumn: "folder_id",
    },
};

export default function SaveToMyListButton({
    itemType,
    itemId,
    ownerId,
    currentUser,
}) {
    const [saved, setSaved] = useState(false);
    const [checkingSaved, setCheckingSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const target = SAVE_TARGETS[itemType];
    const isOwner = currentUser?.id === ownerId;

    useEffect(() => {
        let cancelled = false;

        async function checkSaved() {
            setSaved(false);
            setSaveError("");

            // ログインしていない・作成者本人・必要な値がない場合は確認しない
            if (!target || !itemId || !currentUser || isOwner) {
                setCheckingSaved(false);
                return;
            }

            setCheckingSaved(true);

            try {
                const { data, error } = await supabase
                    .from(target.table)
                    .select(target.idColumn)
                    .eq("user_id", currentUser.id)
                    .eq(target.idColumn, itemId)
                    .maybeSingle();

                if (cancelled) return;

                if (error) {
                    console.error("保存状態の確認に失敗", error);
                    setSaveError(
                        `保存状態を確認できませんでした。${error.message}`,
                    );
                    return;
                }

                setSaved(Boolean(data));
            } catch (unexpectedError) {
                if (!cancelled) {
                    console.error(
                        "保存状態の確認中に予期しないエラー",
                        unexpectedError,
                    );
                    setSaveError(
                        `予期しないエラーが発生しました。${unexpectedError?.message ?? unexpectedError
                        }`,
                    );
                }
            } finally {
                if (!cancelled) {
                    setCheckingSaved(false);
                }
            }
        }

        checkSaved();

        return () => {
            cancelled = true;
        };
    }, [currentUser, isOwner, itemId, target]);

    async function handleSave() {
        if (
            saving ||
            saved ||
            checkingSaved ||
            !target ||
            !itemId
        ) {
            return;
        }

        setSaveError("");

        if (!currentUser) {
            setSaveError("保存するにはログインしてください。");
            return;
        }

        // 作成者本人の項目は保存しない
        if (isOwner) return;

        setSaving(true);

        try {
            const values = {
                user_id: currentUser.id,
                [target.idColumn]: itemId,
            };

            const { error } = await supabase
                .from(target.table)
                .upsert(values, {
                    onConflict: `user_id,${target.idColumn}`,
                    ignoreDuplicates: true,
                });

            if (error) {
                console.error("保存に失敗", error);
                setSaveError(`保存に失敗しました。${error.message}`);
                return;
            }

            setSaved(true);
        } catch (unexpectedError) {
            console.error(
                "保存中に予期しないエラー",
                unexpectedError,
            );
            setSaveError(
                `予期しないエラーが発生しました。${unexpectedError?.message ?? unexpectedError
                }`,
            );
        } finally {
            setSaving(false);
        }
    }

    if (!target || !itemId || isOwner) {
        return null;
    }

    let buttonLabel = "自分のマップ一覧に保存";

    if (checkingSaved) {
        buttonLabel = "確認中...";
    } else if (saving) {
        buttonLabel = "保存中...";
    } else if (saved) {
        buttonLabel = "保存済み";
    }

    return (
        <div className="relative flex items-center">
            <button
                type="button"
                onClick={handleSave}
                disabled={checkingSaved || saving || saved}
                className={
                    saved
                        ? "cursor-default rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500"
                        : "rounded-md bg-rose-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                }
            >
                {buttonLabel}
            </button>

            {saveError && (
                <p
                    role="alert"
                    className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[80vw] rounded bg-red-50 px-3 py-2 text-sm text-red-700 shadow-md"
                >
                    {saveError}
                </p>
            )}
        </div>
    );
}