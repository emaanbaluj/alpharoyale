import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function POST(request: Request) {
  const { gameId, userId } = await request.json();

  if (!gameId || !userId) {
    return NextResponse.json({ error: 'Game ID and User ID required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch the game
  const { data: game, error: fetchError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .eq('status', 'waiting')
    .single();

  if (fetchError || !game) {
    return NextResponse.json({ error: 'Game not found or already started' }, { status: 404 });
  }

  // Check that both players are present
  if (!game.player1_id || !game.player2_id) {
    return NextResponse.json({ error: 'Both players must join before starting the game' }, { status: 400 });
  }

  // Only the game creator (player1) can start the game
  if (game.player1_id !== userId) {
    return NextResponse.json({ error: 'Only the game creator can start the game' }, { status: 403 });
  }

  // Start the game
  const { data: updatedGame, error: updateError } = await supabase
    .from('games')
    .update({
      status: 'active',
      started_at: new Date().toISOString()
    })
    .eq('id', gameId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ game: updatedGame });
}

