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

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      game_id: gameId,
      player_id: playerId,
      symbol,
      order_type: orderType,
      side,
      quantity,
      price: price || null,
      trigger_price: triggerPrice || null,
      position_id: positionId || null,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order });
}
