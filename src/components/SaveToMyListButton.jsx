import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { notifySavedMapsChanged, subscribeSavedMapsChanged } from "../lib/savedMaps.js";
import Icon from "./Icon.jsx";
import { showToast } from "../lib/toast.js";

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
    onSavedChange,
    // "button"：文字のボタン（マップ詳細・フォルダ）．"icon"：ブックマークのアイコンだけ（一覧のカード）
    variant = "button",
}) {
    const [saved, setSaved] = useState(false);
    const [checkingSaved, setCheckingSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [saveVersion, setSaveVersion] = useState(0);

    const target = SAVE_TARGETS[itemType];
    const isOwner = currentUser?.id === ownerId;

    useEffect(() => subscribeSavedMapsChanged(() => setSaveVersion((version) => version + 1)), []);

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
    }, [currentUser, isOwner, itemId, target, saveVersion]);

    async function handleSave() {
        if (
            saving ||
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

            const removing = saved && itemType === "map";
            if (saved && !removing) return;
            const { error } = removing
                ? await supabase.from(target.table).delete()
                    .eq("user_id", currentUser.id).eq(target.idColumn, itemId)
                : await supabase.from(target.table).upsert(values, {
                    onConflict: `user_id,${target.idColumn}`,
                    ignoreDuplicates: true,
                });

            if (error) {
                console.error("保存に失敗", error);
                setSaveError(`保存に失敗しました。${error.message}`);
                if (variant === "icon") showToast(removing ? "保存を解除できませんでした。" : "一覧に保存できませんでした。", { tone: "error" });
                return;
            }

            setSaved(!removing);
            if (itemType === "map") notifySavedMapsChanged(itemId, !removing);
            onSavedChange?.(!removing);
        } catch (unexpectedError) {
            console.error(
                "保存中に予期しないエラー",
                unexpectedError,
            );
            setSaveError(
                `予期しないエラーが発生しました。${unexpectedError?.message ?? unexpectedError
                }`,
            );
            if (variant === "icon") showToast("保存できませんでした。もう一度お試しください。", { tone: "error" });
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
        buttonLabel = saved && itemType === "map" ? "解除中..." : "保存中...";
    } else if (saved) {
        buttonLabel = itemType === "map" ? "保存解除" : "保存済み";
    }

    // アイコンだけのブックマークボタン（一覧のカード用．X のブックマークと同じく，押すたびに保存と解除が切り替わる）．
    // 保存済みは塗りつぶし．カードには文言を出す場所がないので，失敗したときは画面上部の通知で伝える．
    if (variant === "icon") {
        if (itemType !== "map") return null;
        const iconLabel = saved ? "自分のマップ一覧から保存を解除" : "自分のマップ一覧に保存";
        return (
            <button
                type="button"
                onClick={handleSave}
                disabled={checkingSaved || saving}
                aria-pressed={saved}
                aria-label={iconLabel}
                title={saved ? "保存を解除" : "一覧に保存"}
                className={`btn-icon ${saved ? "text-ink" : "text-line-strong hover:text-sub"}`}
            >
                <Icon name="bookmark" filled={saved} className="size-5" />
            </button>
        );
    }

    return (
        <div className="relative flex items-center">
            <button
                type="button"
                onClick={handleSave}
                disabled={checkingSaved || saving || (saved && itemType !== "map")}
                className={saved ? "btn btn-sm" : "btn btn-sm btn-primary"}
            >
                {buttonLabel}
            </button>

            {saveError && (
                <p
                    role="alert"
                    className="notice-error absolute right-0 top-full z-20 mt-2 w-72 max-w-[80vw] shadow-md"
                >
                    {saveError}
                </p>
            )}
        </div>
    );
}
