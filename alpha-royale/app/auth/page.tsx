'use client';

export default function AuthPage() {
  // TODO: Tejas - integrate Supabase auth here
  
  return (
    <div className="h-screen bg-black flex items-center justify-center">
      <div className="max-w-md w-full px-6">
        <h1 className="text-4xl font-bold mb-2 text-white">Alpha Royale</h1>
        <p className="text-gray-400 mb-8">Login or sign up to start trading</p>
        
        {/* Auth form will go here - email/password inputs */}
        <input 
          type="email" 
          placeholder="Email"
          className="w-full p-3 mb-3 bg-zinc-900 border border-zinc-800 rounded text-white"
        />
        <input 
          type="password" 
          placeholder="Password"
          className="w-full p-3 mb-4 bg-zinc-900 border border-zinc-800 rounded text-white"
        />
        
        <button className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium">
          Continue
        </button>
      </div>
    </div>
  );
}
