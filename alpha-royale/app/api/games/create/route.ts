import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function POST(request: Request) {
  const { userId, durationMinutes = 60 } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 });
  }

  if (durationMinutes < 1 || durationMinutes > 1440) {
    return NextResponse.json({ error: 'Duration must be between 1 and 1440 minutes' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert({
      player1_id: userId,
      status: 'waiting',
      initial_balance: 10000.00,
      duration_minutes: durationMinutes
    })
    .select()
    .single();

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 });
  }

  const { error: playerError } = await supabase
    .from('game_players')
    .insert({
      game_id: game.id,
      user_id: userId,
      balance: 10000.00,
      equity: 10000.00
    });

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 500 });
  }

  return NextResponse.json({ game });
}
