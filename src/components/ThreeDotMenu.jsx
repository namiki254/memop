import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

export default function ThreeDotMenu({
  label,
  isOpen,
  onToggle,
  onClose,
  children,
}) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        onClose();
      }
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;

      onClose();
      requestAnimationFrame(() => triggerRef.current?.focus());
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    requestAnimationFrame(() => {
      rootRef.current?.querySelector('[role="menuitem"]')?.focus();
    });
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
        className="btn-icon"
      >
        <Icon name="more" className="size-5" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-1 w-max min-w-44 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * メニューの1項目．
 *
 * icon には Icon の name を渡す．アイコンの置き場所は icon が無くても必ず確保するので，
 * アイコンのある項目と無い項目が同じメニューに並んでも，文字の始まる位置がずれない．
 */
export function MenuItem({
  children,
  onClick,
  icon,
  danger = false,
  disabled = false,
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={`flex min-h-11 w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 text-left text-sm disabled:opacity-50 sm:min-h-9 ${
        danger
          ? "text-danger hover:bg-red-50"
          : "text-ink hover:bg-ink/5"
      }`}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        {icon && <Icon name={icon} />}
      </span>
      {children}
    </button>
  );
}
