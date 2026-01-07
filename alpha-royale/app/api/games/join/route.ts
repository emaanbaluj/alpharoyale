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

  const { data: game, error: fetchError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .eq('status', 'waiting')
    .single();

  if (fetchError || !game) {
    return NextResponse.json({ error: 'Game not found or already started' }, { status: 404 });
  }

  if (game.player1_id === userId) {
    return NextResponse.json({ error: 'Cannot join your own game' }, { status: 400 });
  }

  const { data: updatedGame, error: updateError } = await supabase
    .from('games')
    .update({
      player2_id: userId,
      status: 'active',
      started_at: new Date().toISOString()
    })
    .eq('id', gameId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: playerError } = await supabase
    .from('game_players')
    .insert({
      game_id: gameId,
      user_id: userId,
      balance: game.initial_balance,
      equity: game.initial_balance
    });

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }

  return NextResponse.json({ game: updatedGame });
}
