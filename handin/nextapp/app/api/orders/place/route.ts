import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function POST(request: Request) {
  const { gameId, playerId, symbol, orderType, side, quantity, price, triggerPrice, positionId } = await request.json();

  if (!gameId || !playerId || !symbol || !orderType || !side || !quantity) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: order, error } = await supabase.rpc('place_order', {
    p_game_id: gameId,
    p_player_id: playerId,
    p_symbol: symbol,
    p_order_type: orderType,
    p_side: side,
    p_quantity: quantity,
    p_price: price ?? null,
    p_trigger_price: triggerPrice ?? null,
    p_position_id: positionId ?? null
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order });
}
