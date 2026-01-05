'use client'
import { useRouter } from "next/navigation"
import { supabase } from "../../auth/supabaseClient/supabaseClient";
import { useEffect, useState } from "react";
import Image from "next/image";

interface OnGoingGameType {
    opponent: string;
    link: string;
    timeRemaining: string;
}

interface OngoingGameList {
    games: OnGoingGameType[];
}

interface LeaderboardItem {
    position: number;
    username: string;
    winRate: number;
}

interface LeaderboardList {
    players: LeaderboardItem[];
}

export default function HomeScreen() {

    const router = useRouter();

    const [email, setEmail] = useState<string|null>(null);
    async function handleLogout() { await supabase.auth.signOut(); router.push("/auth"); }
    useEffect(() => {supabase.auth.getUser().then(({data:{user}}) => {setEmail(user?.email ?? null);});}, []);

    const [ongoingGames, setOngoingGames] = useState<OngoingGameList>({ games: [] });
    useEffect(() => {
        const dummygame: OnGoingGameType = {
            opponent: "dummy user 1",
            link: "link.com",
            timeRemaining: "1hr 35min",
        };
        const dummygame2: OnGoingGameType = {
            opponent: "dummy user 2",
            link: "link2.com",
            timeRemaining: "1hr 55min",
        };
        setOngoingGames({ games: [dummygame, dummygame2] });
    }, []);

    const [joinGameId, setJoinGameId] = useState<string>("");

    const [leaderboard, setLeaderboard] = useState<LeaderboardList>({ players: []});
    useEffect(() => {
        // testing testing 
        // Generate 10 items dynamically
        const mockPlayers: LeaderboardItem[] = Array.from({ length: 10 }, (_, index) => ({
            position: index + 1,
            username: `dummy user ${index + 1}`,
            // Example logic: Start at 90 win rate and decrease by a random amount or fixed step
            winRate: 90 - (index * 2), 
        }));

        setLeaderboard({ players: mockPlayers });
    }, []);

    return(
        <div className="flex min-h-screen">
            <div className="w-80 bg-gray-900 text-white p-6">
                <Image src="/alpha_royal_logo.png" alt="Logo" width={120} height={120} className="mb-6 mx-auto" />
                <p className="mb-4 text-gray-300 text-sm truncate">{email}</p>
                
                <div className="space-y-3">
                    <button 
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium"
                        onClick={() => router.push('/game')}
                    >
                        Start Game
                    </button>
                    <div className="flex items-center gap-2">
                        <input
                            id="joinGameId"type="text" value={joinGameId} placeholder="Enter Game ID"
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setJoinGameId(e.target.value)}
                            className="w-50 px-4 py-2 bg-gray-800 rounded font-medium"
                        />
                        <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium">
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
                                <div>Games Played: 0</div>
                                <div>Win Rate: 0%</div>
                                <div>Best Return: --</div>
                            </div>
                        </div>
                        <div className="border border-gray-700 bg-gray-900 p-4">
                            <h3 className="font-bold mb-2 text-white">Start a New Game</h3>
                            <p className="text-sm text-gray-400 mb-3">
                                Click "Start Game" begin a 1v1 trading match with another user.
                            </p>
                        </div> 
                        <div className="border border-gray-700 bg-gray-900 p-4">
                            <h3 className="font-bold mb-2 text-white">Join a Game</h3>
                            <p className="text-sm text-gray-400 mb-3">
                                Enter the Game ID and click "Join" to enter a 1v1 trading match with your friend.
                            </p>
                        </div> 
                    </div>
                    <div>
                       <div className="border border-gray-700 bg-gray-900 p-4">
                        <h3 className="font-bold mb-2 text-white">Ongoing Games</h3>
                        <div className="text-sm space-y-1">
                            {ongoingGames.games.length === 0 ? (
                                <p className="text-sm text-gray-400 mb-3">
                                    No ongoing games at the moment.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {ongoingGames.games.map((game, idx) => (
                                    <div key={game.link ?? idx} className="border border-gray-800 p-4">
                                        <p className="text-sm text-gray-300 mb-1 font-bold truncate">
                                            {game.opponent}
                                        </p>
                                        <p className="text-sm text-gray-400 mb-1">
                                            {game.timeRemaining} remaining
                                        </p>
                                        <button className="px-6 py-1 bg-green-600 hover:bg-green-700 rounded font-medium" >
                                            Enter Game
                                        </button>
                                    </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>  

                    </div>
                    <div className="border border-gray-700 bg-gray-900 p-4">
                        <h3 className="font-bold mb-2 text-white">Global Leaderboard</h3>
                        <div className="text-sm space-y-1">
                            {leaderboard?.players.length === 0 ? (
                                <p className="text-sm text-gray-400 mb-3">
                                    Loading...
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {leaderboard.players.map((player, idx) => (
                                    <div key={player.position ?? idx} className="p-1">
                                        <p className="text-sm text-gray-300 mb-1 font-bold truncate">
                                            {player.position}. {player.username}
                                        </p>
                                        <p>
                                            Win Rate: {player.winRate}%
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
