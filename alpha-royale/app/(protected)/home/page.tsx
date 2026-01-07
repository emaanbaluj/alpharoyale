'use client'
import { useRouter } from "next/navigation"
import { supabase } from "../../auth/supabaseClient/supabaseClient";
import { useEffect, useState } from "react";
import Image from "next/image";
import { gameAPI, statsAPI } from "../../lib/api";

interface UserStats {
    gamesPlayed: number;
    wins: number;
    winRate: string;
}

interface LeaderboardItem {
    userId: string;
    wins: number;
    gamesPlayed: number;
    winRate: number;
}

export default function HomeScreen() {
    const router = useRouter();

    const [email, setEmail] = useState<string|null>(null);
    const [userId, setUserId] = useState<string|null>(null);
    const [userStats, setUserStats] = useState<UserStats>({ gamesPlayed: 0, wins: 0, winRate: "0" });
    const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
    const [joinGameId, setJoinGameId] = useState<string>("");
    const [loading, setLoading] = useState(false);

    async function handleLogout() { 
        await supabase.auth.signOut(); 
        router.push("/auth"); 
    }

    useEffect(() => {
        supabase.auth.getUser().then(({data:{user}}) => {
            setEmail(user?.email ?? null);
            setUserId(user?.id ?? null);
            if (user?.id) {
                loadUserStats(user.id);
            }
        });
        loadLeaderboard();
    }, []);

    async function loadUserStats(uid: string) {
        const data = await statsAPI.getUserStats(uid);
        if (data.gamesPlayed !== undefined) {
            setUserStats(data);
        }
    }

    async function loadLeaderboard() {
        const data = await statsAPI.getLeaderboard();
        if (data.leaderboard) {
            setLeaderboard(data.leaderboard);
        }
    }

    async function handleCreateGame() {
        if (!userId) return;
        setLoading(true);
        const result = await gameAPI.createGame(userId);
        setLoading(false);
        if (result.game) {
            router.push(`/game?id=${result.game.id}`);
        } else {
            alert('Failed to create game: ' + result.error);
        }
    }

    async function handleJoinGame() {
        if (!userId || !joinGameId) return;
        setLoading(true);
        const result = await gameAPI.joinGame(joinGameId, userId);
        setLoading(false);
        if (result.game) {
            router.push(`/game?id=${joinGameId}`);
        } else {
            alert('Failed to join game: ' + result.error);
        }
    }

    return(
        <div className="flex min-h-screen">
            <div className="w-80 bg-gray-900 text-white p-6">
                <Image src="/alpha_royal_logo.png" alt="Logo" width={120} height={120} className="mb-6 mx-auto" />
                <p className="mb-4 text-gray-300 text-sm truncate">{email}</p>
                
                <div className="space-y-3">
                    <button 
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium disabled:opacity-50"
                        onClick={handleCreateGame}
                        disabled={loading}
                    >
                        {loading ? 'Creating...' : 'Start Game'}
                    </button>
                    <div className="flex items-center gap-2">
                        <input
                            id="joinGameId" type="text" value={joinGameId} placeholder="Enter Game ID"
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinGameId(e.target.value)}
                            className="w-50 px-4 py-2 bg-gray-800 rounded font-medium text-white"
                        />
                        <button 
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium disabled:opacity-50"
                            onClick={handleJoinGame}
                            disabled={loading || !joinGameId}
                        >
                            Join
                        </button>
                    </div>
                </div>

                <button 
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium mt-4" 
                    onClick={handleLogout}
                >
                    Log Out
                </button>
            </div>
            
            <div className="flex-1 bg-gray-800 p-8">
                <h2 className="text-3xl font-bold mb-4 text-white">Welcome to Alpha Royale</h2>
                <p className="text-gray-400 mb-6">Ready to test your trading skills?</p>
                
                <div className="grid grid-cols-3 gap-5 items-start">

                    <div className="flex flex-col gap-4">
                        <div className="border border-gray-700 bg-gray-900 p-4">
                            <h3 className="font-bold mb-2 text-white">Your Stats</h3>
                            <div className="text-sm space-y-1 text-gray-300">
                                <div>Games Played: {userStats.gamesPlayed}</div>
                                <div>Wins: {userStats.wins}</div>
                                <div>Win Rate: {userStats.winRate}%</div>
                            </div>
                        </div>
                        <div className="border border-gray-700 bg-gray-900 p-4">
                            <h3 className="font-bold mb-2 text-white">Start a New Game</h3>
                            <p className="text-sm text-gray-400 mb-3">
                                Click "Start Game" to create a 1v1 trading match. Share the game ID with a friend.
                            </p>
                        </div> 
                        <div className="border border-gray-700 bg-gray-900 p-4">
                            <h3 className="font-bold mb-2 text-white">Join a Game</h3>
                            <p className="text-sm text-gray-400 mb-3">
                                Enter the Game ID and click "Join" to enter a 1v1 trading match.
                            </p>
                        </div> 
                    </div>
                    <div>
                       <div className="border border-gray-700 bg-gray-900 p-4">
                        <h3 className="font-bold mb-2 text-white">Ongoing Games</h3>
                        <div className="text-sm space-y-1">
                            <p className="text-sm text-gray-400 mb-3">
                                Coming soon - view your active games here
                            </p>
                        </div>
                    </div>  

                    </div>
                    <div className="border border-gray-700 bg-gray-900 p-4">
                        <h3 className="font-bold mb-2 text-white">Global Leaderboard</h3>
                        <div className="text-sm space-y-1">
                            {leaderboard.length === 0 ? (
                                <p className="text-sm text-gray-400 mb-3">
                                    No games played yet
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {leaderboard.map((player, idx) => (
                                    <div key={player.userId} className="p-2 bg-gray-800 rounded">
                                        <p className="text-sm text-gray-300 font-bold truncate">
                                            {idx + 1}. User {player.userId.slice(0, 8)}...
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {player.wins}W / {player.gamesPlayed}G - {player.winRate.toFixed(1)}%
                                        </p>
                                    </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    )
}
