import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="h-screen bg-[#0a0b0d] text-white flex flex-col items-center justify-center">
      <Image src="/alpha_royal_logo.png" alt="Alpha Royale" width={450} height={450} className="mb-8" />
      <p className="text-xl text-gray-400 mb-12">1v1 Trading. Real Markets. Real Skills.</p>
      
      <div className="flex gap-4">
        <Link href="/auth" className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors">
          Get Started
        </Link>
        <Link href="/game" className="px-8 py-3 border border-[#1e1f25] hover:bg-[#13141a] rounded-lg font-medium transition-colors">
          View Demo
        </Link>
      </div>
    </div>
  );
}
