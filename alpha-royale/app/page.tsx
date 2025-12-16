import Link from "next/link";

export default function Home() {
  return (
    <div className="h-screen bg-black text-white flex flex-col items-center justify-center">
      <h1 className="text-6xl font-bold mb-4">Alpha Royale</h1>
      <p className="text-xl text-gray-400 mb-12">1v1 Trading. Real Markets. Real Skills.</p>
      
      <div className="flex gap-4">
        <Link href="/auth" className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">
          Get Started
        </Link>
        <Link href="/game" className="px-8 py-3 border border-zinc-700 hover:bg-zinc-900 rounded-lg font-medium">
          View Demo
        </Link>
      </div>
    </div>
  );
}
