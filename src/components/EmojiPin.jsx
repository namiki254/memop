const PIN_SIZES = {
  sm: {
    body: "h-8 min-w-8 max-w-28 px-1.5 text-base",
    tail: "-mt-1.5 h-3 w-3",
  },
  md: {
    body: "h-10 min-w-10 max-w-32 px-2 text-xl",
    tail: "-mt-2 h-4 w-4",
  },
  lg: {
    body: "h-12 min-w-12 max-w-36 px-2.5 text-2xl",
    tail: "-mt-2.5 h-5 w-5",
  },
};

export function EmojiPin({
  emoji,
  preview = false,
  selected = false,
  size = "sm",
}) {
  const sizeClasses = PIN_SIZES[size] ?? PIN_SIZES.sm;
  // 空文字も未指定と同じ扱いにする（見えないピンになるのを防ぐ）
  const text = String(emoji || "📍");
  // 選択中は色だけでなく，外側の太い枠（白い隙間つき）でも見分けられるようにする
  const borderClasses = selected ? "border-rose-600" : "border-rose-300";

  return (
    <span
      className={`relative flex flex-col items-center ${
        preview ? "opacity-70" : ""
      }`}
    >
      <span
        className={`
          relative z-10 flex w-max items-center justify-center
          overflow-hidden whitespace-nowrap
          rounded-lg border-2 ${borderClasses}
          bg-white font-bold text-[#3F3A3A]
          ${selected ? "shadow-lg ring-4 ring-rose-600 ring-offset-2 ring-offset-white" : "shadow-md"}
          ${sizeClasses.body}
        `}
      >
        <span className="max-w-full truncate leading-none">
          {text}
        </span>
      </span>

      <span
        className={`
          rotate-45 border-r-2 border-b-2
          ${borderClasses} bg-white shadow-sm
          ${sizeClasses.tail}
        `}
      />
    </span>
  );
}