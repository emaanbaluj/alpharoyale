import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get('positionId');
  const playerId = searchParams.get('playerId');

  if (!positionId || !playerId) {
    return NextResponse.json({ error: 'positionId and playerId are required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch TP/SL orders for this position that belong to the player
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('position_id', positionId)
    .eq('player_id', playerId)
    .in('order_type', ['TAKE_PROFIT', 'STOP_LOSS'])
    .in('status', ['pending', 'filled'])
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: orders || [] });
}
