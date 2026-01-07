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

  const { data: positions, error } = await supabase
    .from('positions')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .eq('status', 'open');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ positions });
}
