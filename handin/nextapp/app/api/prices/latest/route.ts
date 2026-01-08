import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function GET(request: Request) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get the latest game state
  const { data: gameState } = await supabase
    .from('game_state')
    .select('current_tick')
    .single();

  if (!gameState) {
    return NextResponse.json({ error: 'Game state not found' }, { status: 404 });
  }

  // Fetch latest prices for current tick
  const { data: prices, error } = await supabase
    .from('price_data')
    .select('*')
    .eq('game_state', gameState.current_tick);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform to { symbol: price } map
  const priceMap: Record<string, number> = {};
  prices?.forEach((p) => {
    priceMap[p.symbol] = parseFloat(p.price);
  });

  return NextResponse.json({ prices: priceMap, tick: gameState.current_tick });
}
