import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: games, error } = await supabase
    .from('games')
    .select('id, player1_id, player2_id, winner_id, started_at, ended_at')
    .eq('status', 'completed')
    .not('winner_id', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const winCounts: Record<string, { wins: number, total: number }> = {};

  games.forEach(game => {
    const p1 = game.player1_id;
    const p2 = game.player2_id;
    const winner = game.winner_id;

    if (!winCounts[p1]) winCounts[p1] = { wins: 0, total: 0 };
    if (p2 && !winCounts[p2]) winCounts[p2] = { wins: 0, total: 0 };

    winCounts[p1].total++;
    if (p2) winCounts[p2].total++;

    if (winner === p1) winCounts[p1].wins++;
    if (winner === p2 && p2) winCounts[p2].wins++;
  });

  const leaderboard = Object.entries(winCounts).map(([userId, stats]) => ({
    userId,
    wins: stats.wins,
    gamesPlayed: stats.total,
    winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0
  }));

  leaderboard.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);

  return NextResponse.json({ leaderboard: leaderboard.slice(0, 10) });
}
