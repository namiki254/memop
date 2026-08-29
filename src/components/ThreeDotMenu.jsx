import { useEffect, useRef } from "react";

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
        className="
  grid h-8 w-8 place-items-center
  rounded-full
  text-xl leading-none text-slate-600
  transition
  hover:bg-slate-100
  hover:text-slate-900
  focus:outline-none
  focus-visible:ring-2
  focus-visible:ring-rose-400
"
      >
        <span aria-hidden="true">⋮</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-11 z-50 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
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
      className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition disabled:opacity-50 ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-slate-700 hover:bg-rose-50"
      }`}
    >
      {children}
    </button>
  );
}