'use client'
import { useRouter } from "next/navigation"
import { supabase } from "../../auth/supabaseClient/supabaseClient";
import { useEffect, useState } from "react";

export default function HomeScreen() {

    const router = useRouter();

    const [email, setEmail] = useState<string|null>(null);
    async function handleLogout() { await supabase.auth.signOut(); router.push("/auth"); }
    useEffect(() => {supabase.auth.getUser().then(({data:{user}}) => {setEmail(user?.email ?? null);});}, []);

    return(
        <div className="flex h-screen">
            <div className="w-64 bg-gray-900 text-white p-6">
                <h1 className="text-2xl font-bold mb-8">Alpha Royale</h1>
                <p className="mb-4 text-gray-300 text-sm truncate">{email}</p>
                <button 
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium mb-6" 
                    onClick={handleLogout}
                >
                    Log Out
                </button>
                
                <div className="space-y-2">
                    <button 
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium"
                        onClick={() => router.push('/game')}
                    >
                        Start Game
                    </button>
                    <button className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium">
                        Leaderboard
                    </button>
                    <button className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium">
                        Match History
                    </button>
                </div>
            </div>
            
            <div className="flex-1 bg-gray-800 p-8">
                <h2 className="text-3xl font-bold mb-4 text-white">Welcome to Alpha Royale</h2>
                <p className="text-gray-400 mb-6">Ready to test your trading skills?</p>
                
                <div className="grid grid-cols-2 gap-4 max-w-2xl">
                    <div className="border border-gray-700 bg-gray-900 p-4">
                        <h3 className="font-bold mb-2 text-white">Your Stats</h3>
                        <div className="text-sm space-y-1 text-gray-300">
                            <div>Games Played: 0</div>
                            <div>Win Rate: 0%</div>
                            <div>Best Return: --</div>
                        </div>
                    </div>
                    <div className="border border-gray-700 bg-gray-900 p-4">
                        <h3 className="font-bold mb-2 text-white">Quick Start</h3>
                        <p className="text-sm text-gray-400 mb-3">
                            Click "Start Game" to begin a 1v1 trading match
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}