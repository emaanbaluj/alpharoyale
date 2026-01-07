import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');
  const playerId = searchParams.get('playerId');

  if (!gameId || !playerId) {
    return NextResponse.json({ error: 'Game ID and Player ID required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: history, error } = await supabase
      .from('equity_history')
      .select('*')
      .eq('game_id', gameId)
      .eq('player_id', playerId)
      .order('game_state', { ascending: true });

    if (error) {
      console.error('Equity history query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform to chart format: { time, value }
    // Use timestamp field (not created_at) and game_state for ordering
    // Return empty array if no history yet
    const chartData = history?.map((h) => ({
      time: h.timestamp,
      value: parseFloat(h.equity)
    })) || [];

    return NextResponse.json({ history: chartData });
  } catch (err) {
    console.error('Equity history endpoint error:', err);
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Unknown error',
      history: [] // Return empty array on error
    }, { status: 200 }); // Return 200 with empty data instead of 500
  }
}
