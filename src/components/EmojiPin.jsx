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
  size = "sm",
}) {
  const sizeClasses = PIN_SIZES[size] ?? PIN_SIZES.sm;
  const text = String(emoji ?? "📍");

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
          rounded-lg border-2 border-rose-300
          bg-white font-bold text-[#3F3A3A]
          shadow-md
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
          border-rose-300 bg-white shadow-sm
          ${sizeClasses.tail}
        `}
      />
    </span>
  );
}