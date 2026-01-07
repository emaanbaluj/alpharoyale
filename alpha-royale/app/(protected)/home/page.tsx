'use client'
import { useRouter } from "next/navigation"
import { supabase } from "../../auth/supabaseClient/supabaseClient";
import { useEffect, useState } from "react";
import Image from "next/image";
import toast from 'react-hot-toast';
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
    const [gameDuration, setGameDuration] = useState<string>("60");
    const [showDurationInput, setShowDurationInput] = useState<boolean>(false);

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
        const duration = parseInt(gameDuration) || 60;
        if (duration < 1 || duration > 1440) {
            toast.error('Game duration must be between 1 and 1440 minutes (24 hours)');
            return;
        }
        setLoading(true);
        const result = await gameAPI.createGame(userId, duration);
        setLoading(false);
        if (result.game) {
            router.push(`/game?id=${result.game.id}`);
        } else {
            toast.error('Failed to create game: ' + result.error);
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
            toast.error('Failed to join game: ' + result.error);
        }
    }

    return(
        <div className="flex min-h-screen">
            <div className="w-80 bg-[#13141a] border-r border-[#1e1f25] text-white p-6">
                <Image src="/alpha_royal_logo.png" alt="Logo" width={150} height={150} className="mb-6 mx-auto" />
                <p className="mb-4 text-gray-300 text-sm truncate">{email}</p>
                
                <div className="space-y-3">
                    {!showDurationInput ? (
                        <button 
                            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium disabled:opacity-50 transition-colors"
                            onClick={() => setShowDurationInput(true)}
                            disabled={loading}
                        >
                            Create Game
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1.5">Game Duration (minutes)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1440"
                                    value={gameDuration}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        // Allow empty string or valid numbers
                                        if (value === '' || (!isNaN(Number(value)) && Number(value) >= 0)) {
                                            setGameDuration(value);
                                        }
                                    }}
                                    onBlur={(e) => {
                                        // Set to default if empty on blur
                                        if (e.target.value === '' || parseInt(e.target.value) < 1) {
                                            setGameDuration('60');
                                        }
                                    }}
                                    className="w-full px-3 py-2 bg-[#0a0b0d] border border-[#1e1f25] text-white rounded text-sm focus:border-blue-500 focus:outline-none font-mono"
                                    placeholder="60"
                                />
                                <p className="text-xs text-gray-500 mt-1">Default: 60 minutes (1 hour)</p>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium disabled:opacity-50 transition-colors"
                                    onClick={handleCreateGame}
                                    disabled={loading}
                                >
                                    {loading ? 'Creating...' : 'Create Game'}
                                </button>
                                <button 
                                    className="px-4 py-2 bg-[#1e1f25] hover:bg-[#25262d] rounded font-medium transition-colors"
                                    onClick={() => setShowDurationInput(false)}
                                    disabled={loading}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <input
                            id="joinGameId" type="text" value={joinGameId} placeholder="Enter Game ID"
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinGameId(e.target.value)}
                            className="w-50 px-4 py-2 bg-[#0a0b0d] border border-[#1e1f25] rounded font-medium text-white focus:border-blue-500 focus:outline-none"
                        />
                        <button 
                            className="px-4 py-2 bg-[#1e1f25] hover:bg-[#25262d] rounded font-medium disabled:opacity-50 transition-colors"
                            onClick={handleJoinGame}
                            disabled={loading || !joinGameId}
                        >
                            Join
                        </button>
                    </div>
                </div>

                <button 
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium mt-4 transition-colors" 
                    onClick={handleLogout}
                >
                    Log Out
                </button>
            </div>
            
            <div className="flex-1 bg-[#0a0b0d] p-8">
                <h2 className="text-3xl font-bold mb-2 text-white">Welcome to Alpha Royale</h2>
                <p className="text-gray-400 mb-8 max-w-3xl leading-relaxed">
                    A real-time 1v1 trading simulation where two players compete head-to-head using live market data. 
                    Each match gives you a virtual balance to buy and sell stocks. 
                    The player with the highest portfolio value at the end wins. 
                    Trade smart, manage risk, and see who comes out on top.
                </p>
                
                <div className="grid grid-cols-3 gap-5 items-start">

                    <div className="flex flex-col gap-4">
                        {/* Your Stats Card */}
                        <div className="border border-[#1e1f25] bg-[#13141a] rounded-lg p-5 hover:border-[#25262d] transition-colors">
                            <h3 className="text-base font-bold text-white uppercase tracking-wider mb-4 border-b border-[#1e1f25] pb-2">Your Stats</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">Games Played</span>
                                    <span className="text-lg font-mono font-bold text-white">{userStats.gamesPlayed}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">Wins</span>
                                    <span className="text-lg font-mono font-bold text-green-400">{userStats.wins}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">Win Rate</span>
                                    <span className="text-lg font-mono font-bold text-blue-400">{userStats.winRate}%</span>
                                </div>
                            </div>
                        </div>

                        {/* How to Play Cards */}
                        <div className="border border-[#1e1f25] bg-[#13141a] rounded-lg p-5">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Start a New Game</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Click "Start Game" to create a 1v1 trading match. Share the game ID with a friend.
                            </p>
                        </div> 
                        <div className="border border-[#1e1f25] bg-[#13141a] rounded-lg p-5">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Join a Game</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Enter the Game ID and click "Join" to enter a 1v1 trading match.
                            </p>
                        </div> 
                    </div>

                    {/* Ongoing Games Card */}
                    <div>
                       <div className="border border-[#1e1f25] bg-[#13141a] rounded-lg p-5 h-full">
                            <h3 className="text-base font-bold text-white uppercase tracking-wider mb-4 border-b border-[#1e1f25] pb-2">Ongoing Games</h3>
                            <div className="flex items-center justify-center h-32">
                                <p className="text-sm text-gray-500 italic">
                                    Coming soon - view your active games here
                                </p>
                            </div>
                        </div>  
                    </div>

                    {/* Global Leaderboard Card */}
                    <div className="border border-[#1e1f25] bg-[#13141a] rounded-lg p-5">
                        <h3 className="text-base font-bold text-white uppercase tracking-wider mb-4 border-b border-[#1e1f25] pb-2">Global Leaderboard</h3>
                        <div className="text-sm">
                            {leaderboard.length === 0 ? (
                                <div className="flex items-center justify-center h-32">
                                    <p className="text-sm text-gray-500 italic">
                                        No games played yet
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {leaderboard.map((player, idx) => (
                                    <div key={player.userId} className="p-3 bg-[#0a0b0d] border border-[#1e1f25] rounded-lg hover:border-blue-500/50 transition-all group">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-3">
                                                <span className={`text-lg font-bold ${
                                                    idx === 0 ? 'text-yellow-400' :
                                                    idx === 1 ? 'text-gray-300' :
                                                    idx === 2 ? 'text-orange-400' :
                                                    'text-blue-400'
                                                }`}>
                                                    #{idx + 1}
                                                </span>
                                                <span className="text-sm text-white font-medium truncate">
                                                    User {player.userId.slice(0, 8)}...
                                                </span>
                                            </div>
                                            <span className={`text-xs px-2 py-1 rounded ${
                                                player.winRate >= 70 ? 'bg-green-900/30 text-green-400' :
                                                player.winRate >= 50 ? 'bg-blue-900/30 text-blue-400' :
                                                'bg-red-900/30 text-red-400'
                                            }`}>
                                                {player.winRate.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-gray-400 font-mono ml-8">
                                            <span>{player.wins} Wins</span>
                                            <span>•</span>
                                            <span>{player.gamesPlayed} Games</span>
                                        </div>
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
