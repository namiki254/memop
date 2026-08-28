import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="grid h-full min-h-[28rem] place-items-center px-4 text-center">
      <div>
        <h1 className="text-8xl font-black text-[#F47281] sm:text-9xl">
        🥺🥺🥺 <br />
        🥺 404 🥺 <br />
        🥺🥺🥺
        </h1>

        <h2 className="mt-4 text-2xl font-black text-[#3F3A3A] sm:text-4xl">
          Not Found
        </h2>

        <Link
          to="/"
          className="mt-8 inline-block rounded-full bg-[#F47281] px-6 py-3 font-bold text-white transition hover:bg-[#E95F70]"
        >
          トップページに戻る
        </Link>
      </div>
    </div>
  );
}