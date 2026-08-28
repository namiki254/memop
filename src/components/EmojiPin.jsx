export function EmojiPin({ emoji, preview = false }) {
  return (
    <span
      className={`relative flex flex-col items-center ${
        preview ? "opacity-70" : ""
      }`}
    >
      <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-rose-300 bg-white text-xl shadow-md">
        {emoji}
      </span>

      <span className="-mt-2 h-4 w-4 rotate-45 border-r-2 border-b-2 border-rose-300 bg-white" />
    </span>
  );
}